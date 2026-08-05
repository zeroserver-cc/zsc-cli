import { ensureSession } from '../ensureSession';
import { profileHasSession } from '../../infrastructure/config/store';
import { resolveActiveProfile } from '../../infrastructure/config/profile';
import { loginWithTokenUseCase } from '../../application/usecases/LoginWithTokenUseCase';
import { loginWithTwoFactor } from '../loginFlow';
import { prompt, promptPassword } from '../io/prompt';

jest.mock('../../infrastructure/config/store');
jest.mock('../../infrastructure/config/profile', () => ({
  ...jest.requireActual('../../infrastructure/config/profile'),
  resolveActiveProfile: jest.fn(),
}));
jest.mock('../../application/usecases/LoginWithTokenUseCase');
jest.mock('../loginFlow');
jest.mock('../io/prompt', () => ({
  prompt: jest.fn(),
  promptPassword: jest.fn(),
  readStdin: jest.fn(),
}));

const mockedHasSession = profileHasSession as jest.MockedFunction<typeof profileHasSession>;
const mockedResolve = resolveActiveProfile as jest.MockedFunction<typeof resolveActiveProfile>;
const mockedTokenLogin = loginWithTokenUseCase as jest.MockedFunction<typeof loginWithTokenUseCase>;
const mockedLoginFlow = loginWithTwoFactor as jest.MockedFunction<typeof loginWithTwoFactor>;
const mockedPrompt = prompt as jest.MockedFunction<typeof prompt>;
const mockedPromptPassword = promptPassword as jest.MockedFunction<typeof promptPassword>;

const user = { id: 'u1', username: 'dev', email: 'dev@zsc.cloud', role: 'developer' as const, roles: ['developer' as const] };

let errorSpy: jest.SpyInstance;
let exitSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
  delete process.env.ZS_ACCESS_TOKEN;
  delete process.env.ZS_REFRESH_TOKEN;
  Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
  mockedResolve.mockReturnValue({ name: 'cliente-x', source: 'zs.toml' });
});

afterEach(() => {
  errorSpy.mockRestore();
  exitSpy.mockRestore();
  Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
});

describe('ensureSession', () => {
  it('does nothing for commands that work without a session', async () => {
    await ensureSession('login');

    expect(mockedResolve).not.toHaveBeenCalled();
  });

  it('does nothing when the resolved profile already has a session', async () => {
    mockedHasSession.mockReturnValue(true);

    await ensureSession('list');

    expect(mockedTokenLogin).not.toHaveBeenCalled();
    expect(mockedLoginFlow).not.toHaveBeenCalled();
  });

  it('authenticates with ZS_ACCESS_TOKEN without prompting (CI path)', async () => {
    mockedHasSession.mockReturnValue(false);
    process.env.ZS_ACCESS_TOKEN = 'env-token';
    process.env.ZS_REFRESH_TOKEN = 'env-refresh';
    mockedTokenLogin.mockResolvedValueOnce({ accessToken: 'env-token', refreshToken: 'env-refresh', user });

    await ensureSession('deploy');

    expect(mockedTokenLogin).toHaveBeenCalledWith('env-token', 'env-refresh');
    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('profile "cliente-x"'));
  });

  it('fails fast with an actionable message when non-interactive and sessionless', async () => {
    mockedHasSession.mockReturnValue(false);

    await expect(ensureSession('deploy')).rejects.toThrow('process.exit(1)');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Profile "cliente-x" has no session. Run "zs login --profile cliente-x" first.'),
    );
    expect(mockedPrompt).not.toHaveBeenCalled();
  });

  it('prompts for email/password when interactive and sessionless', async () => {
    mockedHasSession.mockReturnValue(false);
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    mockedPrompt.mockResolvedValueOnce('dev@zsc.cloud');
    mockedPromptPassword.mockResolvedValueOnce('secret');
    mockedLoginFlow.mockResolvedValueOnce({
      token: 't',
      accessToken: 't',
      refreshToken: 'r',
      expiresAt: 'x',
      user,
    });

    await ensureSession('list');

    expect(mockedLoginFlow).toHaveBeenCalledWith('dev@zsc.cloud', 'secret');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('session stored in profile "cliente-x"'),
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
