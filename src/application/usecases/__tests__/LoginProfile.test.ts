import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loginUseCase } from '../LoginUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { resetStoreStateForTests } from '../../../infrastructure/config/store';
import { setProfileFlag } from '../../../infrastructure/config/profile';
import { AuthPayload } from '../../../domain/entities/types';

// Real store against an isolated HOME: this test verifies end to end that a
// login lands in the resolved profile's session file.
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: jest.fn(),
}));
jest.mock('../../../infrastructure/graphql/client', () => ({
  ...jest.requireActual('../../../infrastructure/graphql/client'),
  gqlRequest: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { homedir } = require('os') as { homedir: jest.Mock };
const mockedGqlRequest = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

const payload: AuthPayload = {
  token: 'token-a',
  accessToken: 'token-a',
  refreshToken: 'refresh-a',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  user: { id: 'u1', username: 'dev', email: 'dev@zsc.cloud', role: 'developer', roles: ['developer'] },
};

let home: string;

function configDirPath(): string {
  return join(home, '.config', 'zsc');
}

beforeEach(() => {
  jest.clearAllMocks();
  home = mkdtempSync(join(tmpdir(), 'zsc-login-profile-'));
  homedir.mockReturnValue(home);
  delete process.env.ZS_PROFILE;
  setProfileFlag(undefined);
  resetStoreStateForTests();
  process.chdir(mkdtempSync(join(tmpdir(), 'zsc-login-cwd-')));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  setProfileFlag(undefined);
});

describe('loginUseCase with session profiles', () => {
  it('stores the session, including identity, under the resolved profile', async () => {
    setProfileFlag('cliente-x');
    mockedGqlRequest.mockResolvedValueOnce({ login: payload });

    await loginUseCase('dev@zsc.cloud', 'secret');

    const session = JSON.parse(
      readFileSync(join(configDirPath(), 'sessions', 'cliente-x.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(session.accessToken).toBe('token-a');
    expect(session.refreshToken).toBe('refresh-a');
    expect(session.username).toBe('dev');
    expect(session.email).toBe('dev@zsc.cloud');

    // Nothing session-scoped leaks into the global config.
    expect(existsSync(join(configDirPath(), 'config.json'))).toBe(false);
  });

  it('stores the session in the default profile when none is selected', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ login: payload });

    await loginUseCase('dev@zsc.cloud', 'secret');

    expect(existsSync(join(configDirPath(), 'sessions', 'default.json'))).toBe(true);
  });
});
