import axios, { AxiosError } from 'axios';
import {
  getBackendUrl,
  getConfigValue,
  setConfigValue,
  deleteConfigValue,
} from '../config/store';
import { REFRESH_TOKEN_MUTATION } from './queries';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown[]; path?: string[] }>;
}

export class GraphQLError extends Error {
  constructor(message: string, public readonly errors?: unknown[]) {
    super(message);
    this.name = 'GraphQLError';
  }
}

function isAuthError(error: unknown): boolean {
  if (!(error instanceof GraphQLError)) return false;
  const firstError = error.errors?.[0] as { message?: string } | undefined;
  const message = firstError?.message?.toLowerCase() ?? error.message.toLowerCase();
  return (
    message.includes('invalid token') ||
    message.includes('authentication required') ||
    message.includes('access denied') ||
    message.includes('unauthorized')
  );
}

async function rawGqlRequest<T>(
  url: string,
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await axios.post<GraphQLResponse<T>>(
    url,
    { query, variables },
    { headers, timeout: 15_000 },
  );

  const { data, errors } = response.data;
  if (errors?.length) throw new GraphQLError(errors[0].message, errors);
  if (data === undefined) throw new GraphQLError('Empty response from server');
  return data;
}

interface RefreshResponse {
  refreshToken: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    user: { role: string };
  };
}

function storeSession(accessToken: string, refreshToken: string, role: string): void {
  setConfigValue('accessToken', accessToken);
  setConfigValue('refreshToken', refreshToken);
  setConfigValue('token', accessToken);
  setConfigValue('role', role);
}

function clearSession(): void {
  deleteConfigValue('accessToken');
  deleteConfigValue('refreshToken');
  deleteConfigValue('token');
  deleteConfigValue('role');
}

async function performRefresh(url: string, refreshToken: string): Promise<string | null> {
  try {
    const data = await rawGqlRequest<RefreshResponse>(
      url,
      REFRESH_TOKEN_MUTATION,
      { refreshToken },
    );
    const result = data.refreshToken;
    storeSession(result.accessToken, result.refreshToken, result.user.role);
    return result.accessToken;
  } catch {
    clearSession();
    return null;
  }
}

export async function refreshCurrentSession(): Promise<string | null> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/graphql`;
  const refreshToken = getConfigValue('refreshToken');
  if (!refreshToken) return null;
  return performRefresh(url, refreshToken);
}

function handleAxiosError(backendUrl: string, err: AxiosError): never {
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    throw new GraphQLError(
      `Cannot reach backend at ${backendUrl}. Check "zs config get backend-url" or if the server is running.`,
    );
  }
  if (err.code === 'ETIMEDOUT') {
    throw new GraphQLError('Request timed out. The backend may be overloaded.');
  }
  if (err.response?.status === 401) {
    throw new GraphQLError('Session expired or invalid. Run "zs login" again.');
  }
  throw new GraphQLError(`Request failed: ${err.message}`);
}

export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/graphql`;
  const accessToken = token ?? getConfigValue('accessToken');

  try {
    return await rawGqlRequest<T>(url, query, variables, accessToken);
  } catch (error) {
    if (!isAuthError(error) || !accessToken) {
      if (axios.isAxiosError(error)) {
        handleAxiosError(backendUrl, error);
      }
      throw error;
    }

    const refreshToken = getConfigValue('refreshToken');
    if (!refreshToken) {
      clearSession();
      throw new GraphQLError('Session expired or invalid. Run "zs login" again.');
    }

    // Another concurrent request may have already refreshed the token while this
    // one was in flight. If the stored access token changed, retry with it
    // instead of clearing the session.
    const currentAccessToken = getConfigValue('accessToken');
    if (currentAccessToken && currentAccessToken !== accessToken) {
      return rawGqlRequest<T>(url, query, variables, currentAccessToken);
    }

    const newAccessToken = await performRefresh(url, refreshToken);
    if (!newAccessToken) {
      throw new GraphQLError('Session expired or invalid. Run "zs login" again.');
    }

    return rawGqlRequest<T>(url, query, variables, newAccessToken);
  }
}
