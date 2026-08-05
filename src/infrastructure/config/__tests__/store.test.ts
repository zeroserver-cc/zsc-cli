import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { homedir } = require('os') as { homedir: jest.Mock };

import {
  deleteConfigValue,
  getBackendUrl,
  getConfigValue,
  listSessionProfiles,
  profileHasSession,
  resetStoreStateForTests,
  setConfigValue,
} from '../store';
import { setProfileFlag } from '../profile';

let home: string;

function configDirPath(): string {
  return join(home, '.config', 'zsc');
}

function configFilePath(): string {
  return join(configDirPath(), 'config.json');
}

function sessionFilePath(profile: string): string {
  return join(configDirPath(), 'sessions', `${profile}.json`);
}

function writeLegacyConfig(data: Record<string, unknown>): void {
  mkdirSync(configDirPath(), { recursive: true });
  writeFileSync(configFilePath(), JSON.stringify(data));
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'zsc-store-home-'));
  homedir.mockReturnValue(home);
  setProfileFlag(undefined);
  delete process.env.ZS_PROFILE;
  resetStoreStateForTests();
  // Resolution reads ./zs.toml; keep tests away from any real project file.
  process.chdir(mkdtempSync(join(tmpdir(), 'zsc-store-cwd-')));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  setProfileFlag(undefined);
  delete process.env.ZS_PROFILE;
});

describe('legacy session migration', () => {
  it('moves session fields from config.json into the default profile', () => {
    writeLegacyConfig({
      backendUrl: 'http://localhost:4000',
      token: 'legacy-token',
      accessToken: 'legacy-token',
      refreshToken: 'legacy-refresh',
      role: 'developer',
      roles: ['developer'],
      authType: 'jwt',
      lastUpdateCheck: '2026-01-01T00:00:00.000Z',
    });

    // The legacy login keeps working after the move.
    expect(getConfigValue('accessToken')).toBe('legacy-token');
    expect(getConfigValue('refreshToken')).toBe('legacy-refresh');

    const session = readJson(sessionFilePath('default'));
    expect(session.accessToken).toBe('legacy-token');
    expect(session.roles).toEqual(['developer']);

    const global = readJson(configFilePath());
    expect(global.accessToken).toBeUndefined();
    expect(global.refreshToken).toBeUndefined();
    // Global settings stay behind, untouched.
    expect(global.backendUrl).toBe('http://localhost:4000');
    expect(global.lastUpdateCheck).toBe('2026-01-01T00:00:00.000Z');
    expect(getBackendUrl()).toBe('http://localhost:4000');
  });

  it('keeps credentials owner-only after migration', () => {
    writeLegacyConfig({ backendUrl: 'https://api.zeroserver.cc', accessToken: 't' });

    getConfigValue('accessToken');

    // eslint-disable-next-line no-bitwise
    expect(statSync(sessionFilePath('default')).mode & 0o777).toBe(0o600);
  });

  it('never overwrites an existing default profile during migration', () => {
    writeLegacyConfig({ backendUrl: 'https://api.zeroserver.cc', accessToken: 'old-token' });
    mkdirSync(join(configDirPath(), 'sessions'), { recursive: true });
    writeFileSync(sessionFilePath('default'), JSON.stringify({ accessToken: 'new-token' }));

    expect(getConfigValue('accessToken')).toBe('new-token');
    expect(readJson(configFilePath()).accessToken).toBeUndefined();
  });

  it('survives concurrent first-run migrations without losing the session', async () => {
    // Regression test: two processes racing the migration used to end with the
    // migrated tokens destroyed — a reader saw a half-written default.json,
    // parsed it as {} and its read-modify-write clobbered the real contents.
    writeLegacyConfig({
      backendUrl: 'https://api.zeroserver.cc',
      accessToken: 'AT',
      refreshToken: 'RT',
      role: 'developer',
    });

    const tsNodeRegister = require.resolve('ts-node/register/transpile-only');
    const storeModule = join(__dirname, '..', 'store');
    const workerPath = join(home, 'race-worker.js');
    writeFileSync(
      workerPath,
      `process.env.HOME = ${JSON.stringify(home)};\n` +
        `require(${JSON.stringify(tsNodeRegister)});\n` +
        `const store = require(${JSON.stringify(storeModule)});\n` +
        `store.getConfigValue('accessToken');\n` +
        `store.setConfigValue('username', 'dev');\n`,
    );

    const repoRoot = join(__dirname, '..', '..', '..');
    const runWorker = (): Promise<void> =>
      new Promise((resolvePromise, rejectPromise) => {
        const child = spawn('node', [workerPath], { cwd: repoRoot, stdio: 'inherit' });
        child.on('error', rejectPromise);
        child.on('exit', (code) =>
          code === 0 ? resolvePromise() : rejectPromise(new Error(`worker exited with ${code}`)),
        );
      });

    // All workers race the same legacy config at once, like two terminals (or
    // parallel CI jobs) running zs right after the upgrade.
    await Promise.all(Array.from({ length: 6 }, runWorker));

    const session = readJson(sessionFilePath('default'));
    expect(session.accessToken).toBe('AT');
    expect(session.refreshToken).toBe('RT');
    const global = readJson(configFilePath());
    expect(global.accessToken).toBeUndefined();
    expect(global.backendUrl).toBe('https://api.zeroserver.cc');
  }, 60_000);
});

describe('profile routing', () => {
  it('writes session fields to the resolved profile file only', () => {
    setProfileFlag('cliente-x');
    setConfigValue('accessToken', 'token-x');
    setConfigValue('username', 'dev-x');

    expect(readJson(sessionFilePath('cliente-x')).accessToken).toBe('token-x');
    expect(existsSync(sessionFilePath('default'))).toBe(false);
    expect(getConfigValue('accessToken')).toBe('token-x');

    // Another profile does not see the session.
    setProfileFlag('other');
    expect(getConfigValue('accessToken')).toBeUndefined();
  });

  it('keeps backendUrl global across profiles', () => {
    setProfileFlag('cliente-x');
    setConfigValue('backendUrl', 'http://staging:4000');

    expect(readJson(configFilePath()).backendUrl).toBe('http://staging:4000');
    // Global keys never touch the profile file (which may not even exist yet).
    const sessionFile = sessionFilePath('cliente-x');
    expect(existsSync(sessionFile) ? readJson(sessionFile).backendUrl : undefined).toBeUndefined();

    setProfileFlag('other');
    expect(getBackendUrl()).toBe('http://staging:4000');
  });

  it('stores activeProfile globally so later runs resolve it', () => {
    setConfigValue('activeProfile', 'work');

    expect(readJson(configFilePath()).activeProfile).toBe('work');
    setProfileFlag(undefined);
    setConfigValue('accessToken', 'token-work');
    expect(readJson(sessionFilePath('work')).accessToken).toBe('token-work');
  });

  it('deletes session fields from the resolved profile only', () => {
    setProfileFlag('cliente-x');
    setConfigValue('accessToken', 'token-x');
    setProfileFlag('other');
    setConfigValue('accessToken', 'token-other');

    deleteConfigValue('accessToken');

    expect(getConfigValue('accessToken')).toBeUndefined();
    expect(readJson(sessionFilePath('cliente-x')).accessToken).toBe('token-x');
  });
});

describe('file permissions and atomic writes', () => {
  it('re-tightens a session file that was left world-readable', () => {
    mkdirSync(join(configDirPath(), 'sessions'), { recursive: true });
    writeFileSync(sessionFilePath('default'), JSON.stringify({ accessToken: 't' }), { mode: 0o644 });

    setConfigValue('refreshToken', 'r');

    // eslint-disable-next-line no-bitwise
    expect(statSync(sessionFilePath('default')).mode & 0o777).toBe(0o600);
    expect(readJson(sessionFilePath('default')).accessToken).toBe('t');
  });

  it('creates the sessions directory owner-only', () => {
    setConfigValue('accessToken', 't');

    // eslint-disable-next-line no-bitwise
    expect(statSync(join(configDirPath(), 'sessions')).mode & 0o777).toBe(0o700);
  });

  it('writes atomically, leaving no temp files behind', () => {
    setConfigValue('accessToken', 't');
    setConfigValue('refreshToken', 'r');

    const leftovers = readdirSync(join(configDirPath(), 'sessions')).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
    expect(readJson(sessionFilePath('default'))).toEqual({ accessToken: 't', refreshToken: 'r' });
  });
});

describe('profile listing', () => {
  it('lists profiles with identity and session state, sorted by name', () => {
    mkdirSync(join(configDirPath(), 'sessions'), { recursive: true });
    writeFileSync(
      sessionFilePath('work'),
      JSON.stringify({ accessToken: 't', username: 'dev', email: 'dev@zsc.cloud' }),
    );
    writeFileSync(sessionFilePath('cliente-x'), JSON.stringify({ accessToken: 't2' }));
    writeFileSync(sessionFilePath('empty'), JSON.stringify({ username: 'ghost' }));

    expect(listSessionProfiles()).toEqual([
      { name: 'cliente-x', username: undefined, email: undefined, hasSession: true },
      { name: 'empty', username: 'ghost', email: undefined, hasSession: false },
      { name: 'work', username: 'dev', email: 'dev@zsc.cloud', hasSession: true },
    ]);
  });

  it('reports session presence from access or refresh tokens', () => {
    expect(profileHasSession('nope')).toBe(false);
    mkdirSync(join(configDirPath(), 'sessions'), { recursive: true });
    writeFileSync(sessionFilePath('refresh-only'), JSON.stringify({ refreshToken: 'r' }));

    expect(profileHasSession('refresh-only')).toBe(true);
  });
});
