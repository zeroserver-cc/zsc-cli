import { User } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { ME_QUERY } from '../../infrastructure/graphql/queries';
import { deleteConfigValue, setConfigValue } from '../../infrastructure/config/store';

export interface TokenLoginResult {
  accessToken: string;
  refreshToken?: string;
  user: User;
}

export async function loginWithTokenUseCase(
  accessToken: string,
  refreshToken?: string,
): Promise<TokenLoginResult> {
  const data = await gqlRequest<{ me: User }>(
    ME_QUERY,
    undefined,
    accessToken,
  );

  setConfigValue('accessToken', accessToken);
  setConfigValue('token', accessToken);
  setConfigValue('authType', 'jwt');
  if (refreshToken) {
    setConfigValue('refreshToken', refreshToken);
  }
  setConfigValue('role', data.me.role);
  setConfigValue('roles', data.me.roles ?? [data.me.role]);
  // Identifies the profile in `zs session list` without a network round-trip.
  setConfigValue('username', data.me.username);
  setConfigValue('email', data.me.email);
  // Fresh sessions always start acting as the own account.
  deleteConfigValue('activeAccountId');

  return {
    accessToken,
    refreshToken,
    user: data.me,
  };
}
