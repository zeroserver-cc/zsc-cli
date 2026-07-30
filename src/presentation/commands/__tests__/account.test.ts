import { Command } from 'commander';
import { registerAccountCommands } from '../account';
import {
  getActiveAccountUseCase,
  listAccountsUseCase,
  switchAccountUseCase,
} from '../../../application/usecases/AccountUseCase';
import { getConfigValue } from '../../../infrastructure/config/store';

jest.mock('../../../application/usecases/AccountUseCase');
jest.mock('../../../infrastructure/config/store', () => ({
  ...jest.requireActual('../../../infrastructure/config/store'),
  getConfigValue: jest.fn(),
}));

const mockedListAccounts = listAccountsUseCase as jest.MockedFunction<typeof listAccountsUseCase>;
const mockedSwitchAccount = switchAccountUseCase as jest.MockedFunction<typeof switchAccountUseCase>;
const mockedGetActive = getActiveAccountUseCase as jest.MockedFunction<typeof getActiveAccountUseCase>;
const mockedGetConfigValue = getConfigValue as jest.MockedFunction<typeof getConfigValue>;

const ownAccount = { id: 'aaaa-1111', username: 'dev', teamRole: null };
const teamAccount = { id: 'bbbb-2222', username: 'acme', teamRole: 'member' as const };

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerAccountCommands(program);
  return program;
}

describe('zs account', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetConfigValue.mockReturnValue(undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  async function run(...args: string[]): Promise<void> {
    await buildProgram().parseAsync(['node', 'zs', ...args]);
  }

  function printedOutput(): string {
    return logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  }

  it('bare command shows the own account when nothing is stored', async () => {
    mockedGetActive.mockResolvedValueOnce(null);

    await run('account');

    expect(printedOutput()).toContain('Account: own');
  });

  it('bare command shows the active team account and role', async () => {
    mockedGetActive.mockResolvedValueOnce({ username: 'acme', teamRole: 'member' });

    await run('account');

    expect(printedOutput()).toContain('Account: @acme (team role: member)');
  });

  it('list marks the own account as active when nothing is stored', async () => {
    mockedListAccounts.mockResolvedValueOnce([ownAccount, teamAccount]);

    await run('account', 'list');

    const output = printedOutput();
    expect(output).toContain('dev');
    expect(output).toContain('acme');
    expect(output).toContain('owner');
    expect(output).toContain('member');
    expect(output).toContain('*');
  });

  it('list marks the stored active account', async () => {
    mockedListAccounts.mockResolvedValueOnce([ownAccount, teamAccount]);
    mockedGetConfigValue.mockImplementation((key) =>
      key === 'activeAccountId' ? 'bbbb-2222' : undefined,
    );

    await run('account', 'list');

    expect(printedOutput()).toContain('*');
  });

  it('switch prints a confirmation with the team role', async () => {
    mockedSwitchAccount.mockResolvedValueOnce({
      username: 'acme',
      teamRole: 'member',
      user: { id: 'u1', username: 'dev', email: 'dev@zsc.cloud', role: 'developer' },
    });

    await run('account', 'switch', 'acme');

    expect(mockedSwitchAccount).toHaveBeenCalledWith('acme');
    expect(printedOutput()).toContain('Now acting as @acme (team member)');
  });
});
