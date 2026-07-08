import { User } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { ME_QUERY } from '../../infrastructure/graphql/queries';
import { setConfigValue } from '../../infrastructure/config/store';

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
  if (refreshToken) {
    setConfigValue('refreshToken', refreshToken);
  }
  setConfigValue('role', data.me.role);

  return {
    accessToken,
    refreshToken,
    user: data.me,
  };
}
