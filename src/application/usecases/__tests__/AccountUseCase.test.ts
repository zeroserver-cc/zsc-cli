import {
  getActiveAccountUseCase,
  listAccountsUseCase,
  switchAccountUseCase,
} from '../AccountUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import {
  deleteConfigValue,
  getConfigValue,
  setConfigValue,
} from '../../../infrastructure/config/store';
import { Account, AuthPayload } from '../../../domain/entities/types';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store', () => ({
  ...jest.requireActual('../../../infrastructure/config/store'),
  getConfigValue: jest.fn(),
  setConfigValue: jest.fn(),
  deleteConfigValue: jest.fn(),
}));

const mockedGqlRequest = gqlRequest as jest.MockedFunction<typeof gqlRequest>;
const mockedGetConfigValue = getConfigValue as jest.MockedFunction<typeof getConfigValue>;
const mockedSetConfigValue = setConfigValue as jest.MockedFunction<typeof setConfigValue>;
const mockedDeleteConfigValue = deleteConfigValue as jest.MockedFunction<typeof deleteConfigValue>;

const ownAccount: Account = { id: 'aaaa-1111', username: 'dev', teamRole: null };
const teamAccount: Account = { id: 'bbbb-2222', username: 'acme', teamRole: 'member' };
const accounts: Account[] = [ownAccount, teamAccount];

function switchPayload(activeAccountId: string | null): { switchAccount: AuthPayload } {
  return {
    switchAccount: {
      token: 'token-b',
      accessToken: 'token-b',
      refreshToken: 'refresh-b',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      user: {
        id: 'u1',
        username: 'dev',
        email: 'dev@zsc.cloud',
        role: 'developer',
        roles: ['developer'],
        activeAccountId,
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetConfigValue.mockReturnValue(undefined);
});

describe('listAccountsUseCase', () => {
  it('returns the accounts from myAccounts', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ myAccounts: accounts });

    await expect(listAccountsUseCase()).resolves.toEqual(accounts);
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('myAccounts'));
  });
});

describe('switchAccountUseCase', () => {
  it('switches by exact username and persists the new session', async () => {
    mockedGqlRequest
      .mockResolvedValueOnce({ myAccounts: accounts })
      .mockResolvedValueOnce(switchPayload('bbbb-2222'));

    const result = await switchAccountUseCase('acme');

    expect(result.username).toBe('acme');
    expect(result.teamRole).toBe('member');
    expect(mockedGqlRequest).toHaveBeenNthCalledWith(2, expect.stringContaining('switchAccount'), {
      accountId: 'bbbb-2222',
    });
    expect(mockedSetConfigValue).toHaveBeenCalledWith('accessToken', 'token-b');
    expect(mockedSetConfigValue).toHaveBeenCalledWith('refreshToken', 'refresh-b');
    expect(mockedSetConfigValue).toHaveBeenCalledWith('role', 'developer');
    expect(mockedSetConfigValue).toHaveBeenCalledWith('roles', ['developer']);
    expect(mockedSetConfigValue).toHaveBeenCalledWith('activeAccountId', 'bbbb-2222');
  });

  it('switches by unambiguous id prefix', async () => {
    mockedGqlRequest
      .mockResolvedValueOnce({ myAccounts: accounts })
      .mockResolvedValueOnce(switchPayload('bbbb-2222'));

    const result = await switchAccountUseCase('bbbb');

    expect(result.username).toBe('acme');
    expect(mockedGqlRequest).toHaveBeenNthCalledWith(2, expect.stringContaining('switchAccount'), {
      accountId: 'bbbb-2222',
    });
  });

  it('rejects an ambiguous id prefix', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      myAccounts: [
        { id: 'abcd-1', username: 'one', teamRole: 'member' },
        { id: 'abcd-2', username: 'two', teamRole: 'viewer' },
      ],
    });

    await expect(switchAccountUseCase('abcd')).rejects.toThrow('Ambiguous');
  });

  it('rejects an unknown target without calling switchAccount', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ myAccounts: accounts });

    await expect(switchAccountUseCase('no-such-account')).rejects.toThrow('Unknown account');

    expect(mockedGqlRequest).toHaveBeenCalledTimes(1);
  });

  it('clears activeAccountId when switching back to the own account', async () => {
    mockedGqlRequest
      .mockResolvedValueOnce({ myAccounts: accounts })
      .mockResolvedValueOnce(switchPayload(null));

    const result = await switchAccountUseCase('dev');

    expect(result.teamRole).toBeNull();
    expect(mockedDeleteConfigValue).toHaveBeenCalledWith('activeAccountId');
    expect(mockedSetConfigValue).not.toHaveBeenCalledWith('activeAccountId', expect.anything());
  });

  it('fails early in apikey mode without hitting the backend', async () => {
    mockedGetConfigValue.mockImplementation((key) => (key === 'authType' ? 'apikey' : undefined));

    await expect(switchAccountUseCase('acme')).rejects.toThrow('API key');

    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });
});

describe('getActiveAccountUseCase', () => {
  it('returns null when no active account is stored (own account)', async () => {
    await expect(getActiveAccountUseCase()).resolves.toBeNull();
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });

  it('resolves the stored active account', async () => {
    mockedGetConfigValue.mockImplementation((key) =>
      key === 'activeAccountId' ? 'bbbb-2222' : undefined,
    );
    mockedGqlRequest.mockResolvedValueOnce({ myAccounts: accounts });

    await expect(getActiveAccountUseCase()).resolves.toEqual({ username: 'acme', teamRole: 'member' });
  });
});
