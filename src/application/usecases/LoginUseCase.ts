import { AuthPayload } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { LOGIN_MUTATION } from '../../infrastructure/graphql/queries';
import { deleteConfigValue, setConfigValue } from '../../infrastructure/config/store';

export async function loginUseCase(email: string, password: string): Promise<AuthPayload> {
  const data = await gqlRequest<{ login: AuthPayload }>(
    LOGIN_MUTATION,
    { input: { email, password } },
  );
  setConfigValue('accessToken', data.login.accessToken);
  setConfigValue('refreshToken', data.login.refreshToken);
  setConfigValue('token', data.login.accessToken);
  setConfigValue('role', data.login.user.role);
  // Defensive fallback in case the roles field ever comes back null or empty.
  setConfigValue('roles', data.login.user.roles ?? [data.login.user.role]);
  return data.login;
}

export function logoutUseCase(): void {
  deleteConfigValue('accessToken');
  deleteConfigValue('refreshToken');
  deleteConfigValue('token');
  deleteConfigValue('role');
  deleteConfigValue('roles');
}
