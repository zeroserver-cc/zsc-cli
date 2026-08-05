import { Command } from 'commander';
import { registerSessionCommands } from '../session';
import { listSessionProfiles, profileHasSession, setConfigValue } from '../../../infrastructure/config/store';
import { resolveActiveProfile } from '../../../infrastructure/config/profile';

jest.mock('../../../infrastructure/config/store');
// Keep the real validators (profile names gate file writes); mock only resolution.
jest.mock('../../../infrastructure/config/profile', () => ({
  ...jest.requireActual('../../../infrastructure/config/profile'),
  resolveActiveProfile: jest.fn(),
}));

const mockedList = listSessionProfiles as jest.MockedFunction<typeof listSessionProfiles>;
const mockedHasSession = profileHasSession as jest.MockedFunction<typeof profileHasSession>;
const mockedSetConfigValue = setConfigValue as jest.MockedFunction<typeof setConfigValue>;
const mockedResolve = resolveActiveProfile as jest.MockedFunction<typeof resolveActiveProfile>;

let logSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
let exitSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  exitSpy.mockRestore();
});

async function run(...args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerSessionCommands(program);
  await program.parseAsync(['node', 'zs', 'session', ...args]);
}

function loggedLines(): string[] {
  // Strip ANSI so assertions don't depend on chalk's TTY detection.
  // eslint-disable-next-line no-control-regex
  return logSpy.mock.calls.map((call) => call.join(' ').replace(/\[[0-9;]*m/g, ''));
}

describe('zs session list', () => {
  it('lists profiles, marking the active one with its source', async () => {
    mockedResolve.mockReturnValue({ name: 'work', source: 'zs.toml' });
    mockedList.mockReturnValue([
      { name: 'cliente-x', username: 'devx', email: 'x@zsc.cloud', hasSession: true },
      { name: 'work', username: 'dev', email: 'dev@zsc.cloud', hasSession: true },
    ]);

    await run('list');

    const lines = loggedLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('  cliente-x: devx <x@zsc.cloud>');
    expect(lines[1]).toContain('* work: dev <dev@zsc.cloud>');
    expect(lines[1]).toContain('active — zs.toml');
  });

  it('shows the active profile even when it has no session file yet', async () => {
    mockedResolve.mockReturnValue({ name: 'new-profile', source: 'env' });
    mockedList.mockReturnValue([
      { name: 'default', username: 'dev', email: 'dev@zsc.cloud', hasSession: true },
    ]);

    await run('list');

    const lines = loggedLines();
    expect(lines.some((line) => line.includes('* new-profile: (no session)'))).toBe(true);
    expect(lines.some((line) => line.includes('(active — ZS_PROFILE env)'))).toBe(true);
  });

  it('tells the user how to create a profile when none exist', async () => {
    mockedResolve.mockReturnValue({ name: 'default', source: 'default' });
    mockedList.mockReturnValue([]);

    await run('list');

    // The resolved default always shows up, even with zero session files.
    expect(loggedLines()[0]).toContain('* default: (no session)');
  });
});

describe('zs session use', () => {
  it('sets the global activeProfile', async () => {
    mockedHasSession.mockReturnValue(true);

    await run('use', 'work');

    expect(mockedSetConfigValue).toHaveBeenCalledWith('activeProfile', 'work');
    expect(loggedLines()[0]).toContain('Active profile set to "work"');
  });

  it('hints that a login will be requested when the profile has no session', async () => {
    mockedHasSession.mockReturnValue(false);

    await run('use', 'fresh');

    expect(loggedLines().some((line) => line.includes('has no session yet'))).toBe(true);
  });

  it('rejects an invalid profile name without touching the config', async () => {
    await expect(run('use', '../escape')).rejects.toThrow('process.exit(1)');

    expect(mockedSetConfigValue).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Invalid profile name'));
  });
});
