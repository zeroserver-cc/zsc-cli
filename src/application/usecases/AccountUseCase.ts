import { Account, AuthPayload, TeamRole, User } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { MY_ACCOUNTS_QUERY, SWITCH_ACCOUNT_MUTATION } from '../../infrastructure/graphql/queries';
import {
  deleteConfigValue,
  getConfigValue,
  setConfigValue,
} from '../../infrastructure/config/store';

export async function listAccountsUseCase(): Promise<Account[]> {
  const data = await gqlRequest<{ myAccounts: Account[] }>(MY_ACCOUNTS_QUERY);
  return data.myAccounts;
}

export interface SwitchAccountResult {
  username: string;
  /** Null when the target is the user's own account. */
  teamRole: TeamRole | null;
  user: User;
}

export async function switchAccountUseCase(target: string): Promise<SwitchAccountResult> {
  // The backend requires a session token to switch; API keys are bound to
  // their owner and cannot act as another account.
  if (getConfigValue('authType') === 'apikey') {
    throw new Error(
      'Account switching is not available for API key sessions. Log in with "zs login" (email/password) to switch accounts.',
    );
  }

  const accounts = await listAccountsUseCase();

  // Exact username wins; otherwise accept an unambiguous id prefix.
  let match = accounts.find((account) => account.username === target);
  if (!match) {
    const byIdPrefix = accounts.filter((account) => account.id.startsWith(target));
    if (byIdPrefix.length === 1) {
      match = byIdPrefix[0];
    } else if (byIdPrefix.length > 1) {
      throw new Error(`Ambiguous account id prefix "${target}" (${byIdPrefix.length} matches). Use a longer prefix.`);
    }
  }
  if (!match) {
    throw new Error(`Unknown account "${target}". Run "zs account list" to see the accounts you belong to.`);
  }

  const data = await gqlRequest<{ switchAccount: AuthPayload }>(SWITCH_ACCOUNT_MUTATION, {
    accountId: match.id,
  });
  const payload = data.switchAccount;

  setConfigValue('accessToken', payload.accessToken);
  setConfigValue('refreshToken', payload.refreshToken);
  setConfigValue('token', payload.accessToken);
  setConfigValue('role', payload.user.role);
  setConfigValue('roles', payload.user.roles ?? [payload.user.role]);
  // Null/absent activeAccountId means the session acts as the own account.
  if (payload.user.activeAccountId) {
    setConfigValue('activeAccountId', payload.user.activeAccountId);
  } else {
    deleteConfigValue('activeAccountId');
  }

  return { username: match.username, teamRole: match.teamRole, user: payload.user };
}

export interface ActiveAccount {
  username: string;
  teamRole: TeamRole | null;
}

/** Returns the account the session acts as, or null when acting as the own account. */
export async function getActiveAccountUseCase(): Promise<ActiveAccount | null> {
  const activeAccountId = getConfigValue('activeAccountId');
  if (!activeAccountId) return null;
  const accounts = await listAccountsUseCase();
  const match = accounts.find((account) => account.id === activeAccountId);
  return match ? { username: match.username, teamRole: match.teamRole } : null;
}
