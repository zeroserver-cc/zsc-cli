import { readSecretValue } from '../secrets';
import { readStdin, promptPassword } from '../../io/prompt';

jest.mock('../../io/prompt', () => ({
  readStdin: jest.fn(),
  promptPassword: jest.fn()
}));

const mockReadStdin = readStdin as jest.MockedFunction<typeof readStdin>;
const mockPromptPassword = promptPassword as jest.MockedFunction<typeof promptPassword>;

function setStdinTTY(isTTY: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', { value: isTTY, configurable: true });
}

afterEach(() => {
  jest.clearAllMocks();
});

it('piped stdin: strips only one trailing newline, keeping significant whitespace', async () => {
  setStdinTTY(false);
  mockReadStdin.mockResolvedValue('  padded secret \n');

  await expect(readSecretValue('K')).resolves.toBe('  padded secret ');
  expect(mockPromptPassword).not.toHaveBeenCalled();
});

it('piped stdin: strips a CRLF line ending', async () => {
  setStdinTTY(false);
  mockReadStdin.mockResolvedValue('value\r\n');

  await expect(readSecretValue('K')).resolves.toBe('value');
});

it('TTY: reads from the hidden prompt and never touches stdin', async () => {
  setStdinTTY(true);
  mockPromptPassword.mockResolvedValue(' typed secret ');

  await expect(readSecretValue('K')).resolves.toBe(' typed secret ');
  expect(mockReadStdin).not.toHaveBeenCalled();
});

it('rejects an empty value (a bare newline from a pipe)', async () => {
  setStdinTTY(false);
  mockReadStdin.mockResolvedValue('\n');

  await expect(readSecretValue('K')).rejects.toThrow(/Empty secret value/);
});
