import { AuthPayload } from '../../domain/entities/types';
import { gqlRequest, GraphQLError } from '../../infrastructure/graphql/client';
import { LOGIN_MUTATION } from '../../infrastructure/graphql/queries';
import { deleteConfigValue, setConfigValue } from '../../infrastructure/config/store';

/** The account has 2FA enabled and the login was attempted without a code. */
export class TwoFactorRequiredError extends Error {
  constructor() {
    super('2FA code required');
    this.name = 'TwoFactorRequiredError';
  }
}

/** The supplied 2FA code (TOTP or recovery code) was rejected by the backend. */
export class InvalidTwoFactorCodeError extends Error {
  constructor() {
    super('Invalid 2FA code');
    this.name = 'InvalidTwoFactorCodeError';
  }
}

export async function loginUseCase(
  email: string,
  password: string,
  totpCode?: string,
): Promise<AuthPayload> {
  let data: { login: AuthPayload };
  try {
    data = await gqlRequest<{ login: AuthPayload }>(
      LOGIN_MUTATION,
      { input: { email, password, ...(totpCode ? { totpCode } : {}) } },
    );
  } catch (err) {
    // Map the backend's fixed 2FA messages to typed errors so the presentation
    // layer can drive the prompt/retry flow without string matching.
    if (err instanceof GraphQLError) {
      if (err.message === '2FA code required') throw new TwoFactorRequiredError();
      if (err.message === 'Invalid 2FA code') throw new InvalidTwoFactorCodeError();
    }
    throw err;
  }
  setConfigValue('accessToken', data.login.accessToken);
  setConfigValue('refreshToken', data.login.refreshToken);
  setConfigValue('token', data.login.accessToken);
  setConfigValue('authType', 'jwt');
  setConfigValue('role', data.login.user.role);
  // Defensive fallback in case the roles field ever comes back null or empty.
  setConfigValue('roles', data.login.user.roles ?? [data.login.user.role]);
  // Fresh sessions always start acting as the own account.
  deleteConfigValue('activeAccountId');
  return data.login;
}

export function logoutUseCase(): void {
  deleteConfigValue('accessToken');
  deleteConfigValue('refreshToken');
  deleteConfigValue('token');
  deleteConfigValue('role');
  deleteConfigValue('roles');
  deleteConfigValue('authType');
  deleteConfigValue('activeAccountId');
}
