import { User } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { ME_QUERY } from '../../infrastructure/graphql/queries';
import { deleteConfigValue, setConfigValue } from '../../infrastructure/config/store';

export interface ApiKeyLoginResult {
  user: User;
}

export async function loginWithApiKeyUseCase(apiKey: string): Promise<ApiKeyLoginResult> {
  const key = apiKey.trim();
  if (!key.startsWith('zsk_')) {
    throw new Error(
      'Invalid API key format. ZeroServer API keys start with "zsk_". Generate one in the portal.',
    );
  }

  // The backend resolves the key's owner from the Bearer token, so a
  // successful Me here means the key is valid and active.
  const data = await gqlRequest<{ me: User }>(ME_QUERY, undefined, key);

  setConfigValue('accessToken', key);
  setConfigValue('token', key);
  setConfigValue('authType', 'apikey');
  // API keys are self-contained: there is no refresh flow. Drop any refresh
  // token left over from a previous JWT session.
  deleteConfigValue('refreshToken');
  setConfigValue('role', data.me.role);
  // Defensive fallback in case the roles field ever comes back null or empty.
  setConfigValue('roles', data.me.roles ?? [data.me.role]);
  // Identifies the profile in `zs session list` without a network round-trip.
  setConfigValue('username', data.me.username);
  setConfigValue('email', data.me.email);
  // API key sessions are bound to the key's owner and cannot switch accounts.
  deleteConfigValue('activeAccountId');

  return { user: data.me };
}
