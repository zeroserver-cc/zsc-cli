import { Command } from 'commander';
import { registerSecretsCommands } from '../secrets';
import { deleteAppSecretUseCase } from '../../../application/usecases/SecretsUseCase';
import { requireRole } from '../../../application/usecases/requireRole';
import { handleError } from '../../formatting/errors';
import { prompt } from '../../io/prompt';

jest.mock('../../../application/usecases/SecretsUseCase');
jest.mock('../../../application/usecases/requireRole');
jest.mock('../../formatting/errors', () => ({
  handleError: jest.fn()
}));
jest.mock('../../io/prompt', () => ({
  prompt: jest.fn(),
  promptPassword: jest.fn(),
  readStdin: jest.fn()
}));

const mockedDelete = deleteAppSecretUseCase as jest.MockedFunction<typeof deleteAppSecretUseCase>;
const mockedPrompt = prompt as jest.MockedFunction<typeof prompt>;
const mockedHandleError = handleError as jest.MockedFunction<typeof handleError>;
const mockedRequireRole = requireRole as jest.MockedFunction<typeof requireRole>;

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerSecretsCommands(program);
  return program;
}

async function run(...args: string[]): Promise<void> {
  await buildProgram().parseAsync(['node', 'zs', ...args]);
}

describe('zs secrets delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDelete.mockResolvedValue(true);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.log as jest.Mock).mockRestore();
  });

  it('asks for confirmation and deletes on "y"', async () => {
    mockedPrompt.mockResolvedValueOnce('y');

    await run('secrets', 'delete', 'my-app', 'API_TOKEN');

    expect(mockedPrompt).toHaveBeenCalledTimes(1);
    expect(mockedDelete).toHaveBeenCalledWith('my-app', 'API_TOKEN');
  });

  it('aborts without calling the API when the answer is not "y"', async () => {
    mockedPrompt.mockResolvedValueOnce('n');

    await run('secrets', 'delete', 'my-app', 'API_TOKEN');

    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('skips the prompt with --yes (CI)', async () => {
    await run('secrets', 'delete', 'my-app', 'API_TOKEN', '--yes');

    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(mockedDelete).toHaveBeenCalledWith('my-app', 'API_TOKEN');
  });

  it('rejects an invalid KEY locally, before any prompt or API call', async () => {
    await run('secrets', 'delete', 'my-app', '1BAD-KEY', '--yes');

    expect(mockedDelete).not.toHaveBeenCalled();
    expect(mockedHandleError).toHaveBeenCalledTimes(1);
    const err = mockedHandleError.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Invalid KEY "1BAD-KEY"/);
  });

  it('requires a developer or admin role', async () => {
    await run('secrets', 'delete', 'my-app', 'API_TOKEN', '--yes');

    expect(mockedRequireRole).toHaveBeenCalledWith(['developer', 'admin']);
  });
});
