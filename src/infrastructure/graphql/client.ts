import axios, { AxiosError } from 'axios';
import { getConfigValue } from '../config/store';

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

export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const backendUrl = getConfigValue('backendUrl') ?? 'https://api.zeroserver.cc';
  const url = `${backendUrl}/graphql`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const response = await axios.post<GraphQLResponse<T>>(
      url,
      { query, variables },
      { headers, timeout: 15_000 },
    );

    const { data, errors } = response.data;
    if (errors?.length) throw new GraphQLError(errors[0].message, errors);
    if (data === undefined) throw new GraphQLError('Empty response from server');
    return data;
  } catch (err) {
    if (err instanceof GraphQLError) throw err;

    if (axios.isAxiosError(err)) {
      const axiosErr = err as AxiosError;
      if (axiosErr.code === 'ECONNREFUSED' || axiosErr.code === 'ENOTFOUND') {
        throw new GraphQLError(
          `Cannot reach backend at ${backendUrl}. Check "zs config get backend-url" or if the server is running.`,
        );
      }
      if (axiosErr.code === 'ETIMEDOUT') {
        throw new GraphQLError('Request timed out. The backend may be overloaded.');
      }
      if (axiosErr.response?.status === 401) {
        throw new GraphQLError('Session expired or invalid. Run "zs login" again.');
      }
      throw new GraphQLError(`Request failed: ${axiosErr.message}`);
    }

    throw err;
  }
}
