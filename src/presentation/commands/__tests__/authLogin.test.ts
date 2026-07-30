import { Command } from 'commander';
import { registerAuthCommands } from '../auth';
import {
  InvalidTwoFactorCodeError,
  loginUseCase,
  TwoFactorRequiredError,
} from '../../../application/usecases/LoginUseCase';
import { prompt, promptPassword } from '../../io/prompt';
import { AuthPayload } from '../../../domain/entities/types';

jest.mock('../../../application/usecases/LoginUseCase', () => ({
  ...jest.requireActual('../../../application/usecases/LoginUseCase'),
  loginUseCase: jest.fn(),
  logoutUseCase: jest.fn(),
}));
jest.mock('../../../application/usecases/LoginWithTokenUseCase');
jest.mock('../../../application/usecases/WhoamiUseCase');
jest.mock('../../../infrastructure/config/store');
jest.mock('../../io/prompt', () => ({
  prompt: jest.fn(),
  promptPassword: jest.fn(),
}));

const mockedLoginUseCase = loginUseCase as jest.MockedFunction<typeof loginUseCase>;
const mockedPrompt = prompt as jest.MockedFunction<typeof prompt>;
const mockedPromptPassword = promptPassword as jest.MockedFunction<typeof promptPassword>;

const payload: AuthPayload = {
  token: 'token-a',
  accessToken: 'token-a',
  refreshToken: 'refresh-a',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  user: { id: 'u1', username: 'dev', email: 'dev@zsc.cloud', role: 'developer', roles: ['developer'] },
};

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerAuthCommands(program);
  return program;
}

describe('zs login with 2FA', () => {
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
    // The 2FA flow refuses to prompt without a TTY; pretend we have one.
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
  });

  async function runLogin(...args: string[]): Promise<void> {
    await buildProgram().parseAsync(['node', 'zs', 'login', ...args]);
  }

  it('prompts for the 2FA code when required and retries with it', async () => {
    mockedLoginUseCase
      .mockRejectedValueOnce(new TwoFactorRequiredError())
      .mockResolvedValueOnce(payload);
    mockedPrompt.mockResolvedValueOnce('123456');

    await runLogin('-e', 'dev@zsc.cloud', '-p', 'secret');

    expect(mockedPrompt).toHaveBeenCalledWith('2FA code: ');
    expect(mockedLoginUseCase).toHaveBeenCalledTimes(2);
    expect(mockedLoginUseCase).toHaveBeenNthCalledWith(1, 'dev@zsc.cloud', 'secret', undefined);
    expect(mockedLoginUseCase).toHaveBeenNthCalledWith(2, 'dev@zsc.cloud', 'secret', '123456');
    expect(logSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('dev'));
  });

  it('lets the user retry an invalid code and succeeds within 3 attempts', async () => {
    mockedLoginUseCase
      .mockRejectedValueOnce(new InvalidTwoFactorCodeError())
      .mockResolvedValueOnce(payload);
    mockedPrompt.mockResolvedValueOnce('222222');

    await runLogin('-e', 'dev@zsc.cloud', '-p', 'secret', '--otp', '111111');

    expect(mockedLoginUseCase).toHaveBeenCalledTimes(2);
    expect(mockedLoginUseCase).toHaveBeenNthCalledWith(2, 'dev@zsc.cloud', 'secret', '222222');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid 2FA code. Try again.'));
  });

  it('fails after 3 invalid code attempts', async () => {
    mockedLoginUseCase.mockRejectedValue(new InvalidTwoFactorCodeError());
    mockedPrompt.mockResolvedValue('000000');

    await expect(
      runLogin('-e', 'dev@zsc.cloud', '-p', 'secret', '--otp', '111111'),
    ).rejects.toThrow('process.exit(1)');

    // --otp + 2 prompted retries = 3 code attempts.
    expect(mockedLoginUseCase).toHaveBeenCalledTimes(3);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('uses the --otp flag without prompting', async () => {
    mockedLoginUseCase.mockResolvedValueOnce(payload);

    await runLogin('-e', 'dev@zsc.cloud', '-p', 'secret', '--otp', '123456');

    expect(mockedLoginUseCase).toHaveBeenCalledWith('dev@zsc.cloud', 'secret', '123456');
    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(mockedPromptPassword).not.toHaveBeenCalled();
  });

  it('passes a recovery code from the prompt through verbatim', async () => {
    mockedLoginUseCase
      .mockRejectedValueOnce(new TwoFactorRequiredError())
      .mockResolvedValueOnce(payload);
    mockedPrompt.mockResolvedValueOnce('abcd-efgh');

    await runLogin('-e', 'dev@zsc.cloud', '-p', 'secret');

    expect(mockedLoginUseCase).toHaveBeenNthCalledWith(2, 'dev@zsc.cloud', 'secret', 'abcd-efgh');
  });

  it('fails fast without prompting when stdin is not a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
    mockedLoginUseCase.mockRejectedValueOnce(new TwoFactorRequiredError());

    await expect(runLogin('-e', 'dev@zsc.cloud', '-p', 'secret')).rejects.toThrow('process.exit(1)');

    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('pass it with --otp <code>'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('counts empty prompt answers against the attempt budget instead of looping forever', async () => {
    mockedLoginUseCase.mockRejectedValue(new TwoFactorRequiredError());
    mockedPrompt.mockResolvedValue('   ');

    await expect(runLogin('-e', 'dev@zsc.cloud', '-p', 'secret')).rejects.toThrow('process.exit(1)');

    expect(mockedPrompt).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('2FA code cannot be empty.'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
