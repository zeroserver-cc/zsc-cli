import { Command } from 'commander';
import { registerAiCommands } from '../ai';
import {
  addInferenceServiceTokenUseCase,
  createInferenceServiceUseCase,
  deleteInferenceServiceUseCase,
  listAiModelsUseCase,
  listHfModelFilesUseCase,
  listInferenceServicesUseCase,
  resolveInferenceServiceUseCase,
  revokeInferenceServiceTokenUseCase,
  searchHfModelsUseCase
} from '../../../application/usecases/ManagedInferenceUseCase';
import { GraphQLError } from '../../../infrastructure/graphql/client';
import { getConfigArray, getConfigValue } from '../../../infrastructure/config/store';
import { prompt } from '../../io/prompt';

jest.mock('../../../application/usecases/ManagedInferenceUseCase');
jest.mock('../../../infrastructure/config/store', () => ({
  ...jest.requireActual('../../../infrastructure/config/store'),
  getConfigValue: jest.fn(),
  getConfigArray: jest.fn()
}));
jest.mock('../../io/prompt', () => ({
  ...jest.requireActual('../../io/prompt'),
  prompt: jest.fn()
}));

const mockedListModels = listAiModelsUseCase as jest.MockedFunction<typeof listAiModelsUseCase>;
const mockedListServices = listInferenceServicesUseCase as jest.MockedFunction<
  typeof listInferenceServicesUseCase
>;
const mockedResolve = resolveInferenceServiceUseCase as jest.MockedFunction<
  typeof resolveInferenceServiceUseCase
>;
const mockedCreate = createInferenceServiceUseCase as jest.MockedFunction<
  typeof createInferenceServiceUseCase
>;
const mockedDelete = deleteInferenceServiceUseCase as jest.MockedFunction<
  typeof deleteInferenceServiceUseCase
>;
const mockedAddToken = addInferenceServiceTokenUseCase as jest.MockedFunction<
  typeof addInferenceServiceTokenUseCase
>;
const mockedRevokeToken = revokeInferenceServiceTokenUseCase as jest.MockedFunction<
  typeof revokeInferenceServiceTokenUseCase
>;
const mockedSearchHf = searchHfModelsUseCase as jest.MockedFunction<typeof searchHfModelsUseCase>;
const mockedHfFiles = listHfModelFilesUseCase as jest.MockedFunction<
  typeof listHfModelFilesUseCase
>;
const mockedGetConfigValue = getConfigValue as jest.MockedFunction<typeof getConfigValue>;
const mockedGetConfigArray = getConfigArray as jest.MockedFunction<typeof getConfigArray>;
const mockedPrompt = prompt as jest.MockedFunction<typeof prompt>;

const model = {
  id: 'qwen2.5-7b-q4',
  name: 'Qwen 2.5 7B (Q4_K_M)',
  hfRepo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
  hfFile: 'qwen2.5-7b-instruct-q4_k_m.gguf',
  sizeBytes: 4_680_000_000,
  minVramMb: 6144,
  contextTokens: 32768,
  license: 'apache-2.0',
  supportedBackends: ['cuda', 'rocm', 'cpu'],
  curated: true
};

const hfSummary = {
  repoId: 'bartowski/Qwen2.5-7B-Instruct-GGUF',
  downloads: 1_234_567,
  likes: 890,
  license: 'apache-2.0'
};

const hfFiles = [
  { file: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf', sizeBytes: 4_680_000_000, recommended: true },
  { file: 'Qwen2.5-7B-Instruct-Q8_0.gguf', sizeBytes: 8_100_000_000, recommended: false }
];

const service = {
  id: 'svc-1111',
  name: 'my-llm',
  modelId: model.id,
  model: { ...model },
  status: 'RUNNING' as const,
  machineId: 'machine-1',
  machine: null,
  endpoint: 'https://my-llm.ai.zeroserver.cc',
  errorMessage: null,
  tokens: [{ id: 'tok-aaaa', label: 'web-app', hint: '…x7f2', createdAt: '2026-08-20T10:00:00Z' }],
  createdAt: '2026-08-20T09:00:00Z',
  updatedAt: '2026-08-20T10:00:00Z'
};

function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerAiCommands(program);
  return program;
}

describe('zs ai', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetConfigValue.mockImplementation((key) =>
      key === 'accessToken' ? 'session-token' : undefined
    );
    mockedGetConfigArray.mockImplementation((key) => (key === 'roles' ? ['developer'] : []));
    // The confirmation guard fails fast without a TTY; tests that exercise the
    // prompt path simulate an interactive terminal.
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  async function run(...args: string[]): Promise<void> {
    await buildProgram().parseAsync(['node', 'zs', ...args]);
  }

  function printedOutput(): string {
    return logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  }

  function printedErrors(): string {
    return errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  }

  describe('models', () => {
    it('prints the model catalog as a table', async () => {
      mockedListModels.mockResolvedValueOnce([model]);

      await run('ai', 'models');

      const output = printedOutput();
      expect(output).toContain('qwen2.5-7b-q4');
      expect(output).toContain('Qwen 2.5 7B (Q4_K_M)');
      expect(output).toContain('4.7');
      expect(output).toContain('6 GB');
      expect(output).toContain('32k');
      expect(output).toContain('cuda/rocm/cpu');
      expect(output).toContain('apache-2.0');
    });

    it('works via the catalog alias', async () => {
      mockedListModels.mockResolvedValueOnce([model]);

      await run('ai', 'catalog');

      expect(printedOutput()).toContain('qwen2.5-7b-q4');
    });

    it('warns when the catalog is empty', async () => {
      mockedListModels.mockResolvedValueOnce([]);

      await run('ai', 'models');

      expect(printedOutput()).toContain('No models in the catalog');
    });

    it('searches Hugging Face with --search and prints the next-step hint', async () => {
      mockedSearchHf.mockResolvedValueOnce([hfSummary]);

      await run('ai', 'models', '--search', 'qwen 7b');

      expect(mockedSearchHf).toHaveBeenCalledWith('qwen 7b');
      expect(mockedListModels).not.toHaveBeenCalled();
      const output = printedOutput();
      expect(output).toContain('bartowski/Qwen2.5-7B-Instruct-GGUF');
      expect(output).toContain('1,234,567');
      expect(output).toContain('890');
      expect(output).toContain('apache-2.0');
      expect(output).toContain('zs ai files <owner/repo>');
      expect(output).toContain('zs ai create --model <owner/repo>:<file.gguf>');
    });

    it('warns when the Hugging Face search finds nothing', async () => {
      mockedSearchHf.mockResolvedValueOnce([]);

      await run('ai', 'models', '--search', 'nope-model');

      expect(printedOutput()).toContain('No Hugging Face GGUF repos found for "nope-model"');
    });

    it('rejects an empty or whitespace-only --search before any backend call', async () => {
      await expect(run('ai', 'models', '--search', '')).rejects.toThrow(/at least 2 characters/);
      await expect(run('ai', 'models', '--search', '   ')).rejects.toThrow(/at least 2 characters/);

      expect(mockedSearchHf).not.toHaveBeenCalled();
      expect(mockedListModels).not.toHaveBeenCalled();
    });

    it('strips control chars and ANSI sequences from remote search results', async () => {
      mockedSearchHf.mockResolvedValueOnce([
        { repoId: 'evil\n\u001b[31mowner/repo', downloads: 1, likes: 2, license: 'mit' }
      ]);

      await run('ai', 'models', '--search', 'qwen');

      const output = printedOutput();
      expect(output).toContain('evil[31mowner/repo');
      expect(output).not.toContain('evil\n');
    });

    it('translates a schema mismatch (older backend) into a backend-upgrade message', async () => {
      mockedSearchHf.mockRejectedValueOnce(
        new GraphQLError('Cannot query field "searchHfModels" on type "Query".')
      );

      await expect(run('ai', 'models', '--search', 'qwen')).rejects.toThrow('process.exit(1)');

      expect(printedErrors()).toContain('requires a newer ZeroServer backend');
      expect(printedErrors()).not.toContain('Cannot query field');
    });
  });

  describe('files', () => {
    it('rejects a repo id without owner/ before calling the backend', async () => {
      await expect(run('ai', 'files', 'foo')).rejects.toThrow(/owner\/repo/);

      expect(mockedHfFiles).not.toHaveBeenCalled();
    });
    it('lists the repo GGUF files flagging the recommended pick', async () => {
      mockedHfFiles.mockResolvedValueOnce(hfFiles);

      await run('ai', 'files', 'bartowski/Qwen2.5-7B-Instruct-GGUF');

      expect(mockedHfFiles).toHaveBeenCalledWith('bartowski/Qwen2.5-7B-Instruct-GGUF');
      const output = printedOutput();
      expect(output).toContain('Qwen2.5-7B-Instruct-Q4_K_M.gguf');
      expect(output).toContain('4.7');
      expect(output).toContain('Qwen2.5-7B-Instruct-Q8_0.gguf');
      expect(output).toContain('* = recommended');
      expect(output).toContain(
        'zs ai create --model bartowski/Qwen2.5-7B-Instruct-GGUF:<file.gguf>'
      );
    });

    it('warns when the repo has no root-level GGUF files', async () => {
      mockedHfFiles.mockResolvedValueOnce([]);

      await run('ai', 'files', 'some/repo');

      expect(printedOutput()).toContain('No root-level GGUF files found in "some/repo"');
    });

    it('propagates backend errors untouched', async () => {
      mockedHfFiles.mockRejectedValueOnce(new GraphQLError('Hugging Face API unavailable'));

      await expect(run('ai', 'files', 'some/repo')).rejects.toThrow('process.exit(1)');

      expect(printedErrors()).toContain('Hugging Face API unavailable');
    });
  });

  describe('list', () => {
    it('lists the owner services as a table', async () => {
      mockedListServices.mockResolvedValueOnce([service]);

      await run('ai', 'list');

      const output = printedOutput();
      expect(output).toContain('my-llm');
      expect(output).toContain('Qwen 2.5 7B (Q4_K_M)');
      expect(output).toContain('RUNNING');
      expect(output).toContain('https://my-llm.ai.zeroserver.cc');
    });

    it('shows the VRAM budget and layer count when the service has partial offload', async () => {
      mockedListServices.mockResolvedValueOnce([{ ...service, vramBudgetMb: 4096, gpuLayers: 28 }]);

      await run('ai', 'list');

      const output = printedOutput();
      expect(output).toContain('VRAM');
      expect(output).toContain('4096 MB (28 layers)');
    });

    it('shows a dash in the VRAM column when the service has full offload', async () => {
      mockedListServices.mockResolvedValueOnce([service]);

      await run('ai', 'list');

      expect(printedOutput()).not.toContain('MB (');
    });

    it('warns when there are no services', async () => {
      mockedListServices.mockResolvedValueOnce([]);

      await run('ai', 'list');

      expect(printedOutput()).toContain('No inference services');
    });
  });

  describe('create', () => {
    it('prints the endpoint and the initial token with a shown-once warning', async () => {
      mockedCreate.mockResolvedValueOnce({ service, initialToken: 'zsai-secret-value' });

      await run('ai', 'create', '--model', model.id, '--name', 'my-llm');

      expect(mockedCreate).toHaveBeenCalledWith('my-llm', model.id, undefined);
      const output = printedOutput();
      expect(output).toContain('https://my-llm.ai.zeroserver.cc');
      expect(output).toContain('zsai-secret-value');
      expect(output).toContain('shown only once');
    });

    it('derives a DNS-safe name when --name is omitted', async () => {
      mockedCreate.mockResolvedValueOnce({ service, initialToken: 'tok' });

      await run('ai', 'create', '--model', 'Qwen2.5_7B.Q4');

      const [generatedName] = mockedCreate.mock.calls[0];
      expect(generatedName).toMatch(/^qwen2-5-7b-q4-[0-9a-f]{6}$/);
    });

    it('sends a Hugging Face spec as --model to the backend', async () => {
      const spec = 'bartowski/Qwen2.5-7B-Instruct-GGUF:Qwen2.5-7B-Instruct-Q4_K_M.gguf';
      mockedCreate.mockResolvedValueOnce({ service, initialToken: 'tok' });

      await run('ai', 'create', '--model', spec, '--name', 'my-llm');

      expect(mockedCreate).toHaveBeenCalledWith('my-llm', spec, undefined);
    });

    it('derives a DNS-safe name from a Hugging Face spec', async () => {
      mockedCreate.mockResolvedValueOnce({ service, initialToken: 'tok' });

      await run('ai', 'create', '--model', 'bartowski/Qwen2.5-7B-Instruct-GGUF');

      const [generatedName] = mockedCreate.mock.calls[0];
      expect(generatedName).toMatch(/^bartowski-qwen2-5-7b-instruct-gguf-[0-9a-f]{6}$/);
    });

    it('falls back to llm-<suffix> when the model id has no DNS-safe chars', async () => {
      mockedCreate.mockResolvedValueOnce({ service, initialToken: 'tok' });

      await run('ai', 'create', '--model', '!!!...');

      const [generatedName] = mockedCreate.mock.calls[0];
      expect(generatedName).toMatch(/^llm-[0-9a-f]{6}$/);
    });

    it('derives a safe slug from unicode model ids', async () => {
      mockedCreate.mockResolvedValueOnce({ service, initialToken: 'tok' });

      await run('ai', 'create', '--model', 'Café Môdel 2');

      const [generatedName] = mockedCreate.mock.calls[0];
      expect(generatedName).toMatch(/^caf-m-del-2-[0-9a-f]{6}$/);
    });

    it('rejects a malformed Hugging Face spec before calling the backend', async () => {
      await expect(run('ai', 'create', '--model', 'owner/repo/file.gguf')).rejects.toThrow(
        /invalid Hugging Face model spec/
      );

      expect(mockedCreate).not.toHaveBeenCalled();
    });

    it('propagates backend spec validation errors (gated, split, oversize) untouched', async () => {
      mockedCreate.mockRejectedValueOnce(
        new GraphQLError('Hugging Face repo owner/repo is gated; request access on huggingface.co')
      );

      await expect(
        run('ai', 'create', '--model', 'owner/repo:file.gguf', '--name', 'my-llm')
      ).rejects.toThrow('process.exit(1)');

      expect(printedErrors()).toContain('gated');
      expect(printedErrors()).not.toContain('Request beta access');
    });

    it('rejects a non-DNS-safe --name before calling the backend', async () => {
      await expect(run('ai', 'create', '--model', model.id, '--name', 'Bad_Name')).rejects.toThrow(
        /DNS-safe/
      );

      expect(mockedCreate).not.toHaveBeenCalled();
    });

    it('passes --vram-mb through as the VRAM budget', async () => {
      mockedCreate.mockResolvedValueOnce({ service, initialToken: 'tok' });

      await run('ai', 'create', '--model', model.id, '--name', 'my-llm', '--vram-mb', '4096');

      expect(mockedCreate).toHaveBeenCalledWith('my-llm', model.id, 4096);
    });

    it('creates without a VRAM budget when --vram-mb is omitted (full offload)', async () => {
      mockedCreate.mockResolvedValueOnce({ service, initialToken: 'tok' });

      await run('ai', 'create', '--model', model.id, '--name', 'my-llm');

      expect(mockedCreate).toHaveBeenCalledWith('my-llm', model.id, undefined);
    });

    it.each(['abc', '0', '-1', '1.5', '4096x'])(
      'rejects an invalid --vram-mb value "%s" before calling the backend',
      async (value) => {
        await expect(
          run('ai', 'create', '--model', model.id, '--name', 'my-llm', '--vram-mb', value)
        ).rejects.toThrow(/positive integer/);

        expect(mockedCreate).not.toHaveBeenCalled();
      }
    );

    it('explains the closed-beta allowlist denial', async () => {
      mockedCreate.mockRejectedValueOnce(
        new GraphQLError(
          'Managed inference is in closed beta: this account is not on the AI inference allowlist'
        )
      );

      await expect(run('ai', 'create', '--model', model.id, '--name', 'my-llm')).rejects.toThrow(
        'process.exit(1)'
      );

      expect(printedErrors()).toContain('closed beta');
      expect(printedErrors()).toContain('allowlist');
    });

    it('propagates other backend errors untouched', async () => {
      mockedCreate.mockRejectedValueOnce(new GraphQLError('No eligible node for inference'));

      await expect(run('ai', 'create', '--model', model.id, '--name', 'my-llm')).rejects.toThrow(
        'process.exit(1)'
      );

      expect(printedErrors()).toContain('No eligible node for inference');
      expect(printedErrors()).not.toContain('Request beta access');
    });
  });

  describe('status', () => {
    it('lists the services when no name is given', async () => {
      mockedListServices.mockResolvedValueOnce([service]);

      await run('ai', 'status');

      const output = printedOutput();
      expect(output).toContain('my-llm');
      expect(output).toContain('RUNNING');
    });

    it('details a service including token metadata, never token values', async () => {
      mockedResolve.mockResolvedValueOnce(service);

      await run('ai', 'status', 'my-llm');

      const output = printedOutput();
      expect(output).toContain('my-llm');
      expect(output).toContain('tok-aaaa');
      expect(output).toContain('web-app');
      expect(output).toContain('…x7f2');
    });

    it('shows the VRAM budget line only when the service has partial offload', async () => {
      mockedResolve.mockResolvedValueOnce({ ...service, vramBudgetMb: 4096, gpuLayers: 28 });

      await run('ai', 'status', 'my-llm');

      expect(printedOutput()).toContain('VRAM:     4096 MB (28 layers)');
    });

    it('omits the VRAM budget line for full-offload services', async () => {
      mockedResolve.mockResolvedValueOnce(service);

      await run('ai', 'status', 'my-llm');

      expect(printedOutput()).not.toContain('VRAM:');
    });

    it('fails with a clear error for an unknown service', async () => {
      mockedResolve.mockRejectedValueOnce(
        new Error('Unknown inference service "nope". Run "zs ai list" to see your services.')
      );

      await expect(run('ai', 'status', 'nope')).rejects.toThrow('process.exit(1)');

      expect(printedErrors()).toContain('Unknown inference service "nope"');
    });
  });

  describe('token add', () => {
    it('prints the new token value once with the restart notice', async () => {
      mockedAddToken.mockResolvedValueOnce({
        service,
        token: {
          id: 'tok-bbbb',
          label: 'ci',
          hint: '…k9d1',
          createdAt: '2026-08-21T10:00:00Z',
          token: 'zsai-new-token-value'
        }
      });

      await run('ai', 'token', 'add', 'my-llm', '--label', 'ci');

      expect(mockedAddToken).toHaveBeenCalledWith('my-llm', 'ci');
      const output = printedOutput();
      expect(output).toContain('zsai-new-token-value');
      expect(output).toContain('shown only once');
      expect(output).toContain('restarts briefly');
    });
  });

  describe('token list', () => {
    it('prints label and hint, never token values', async () => {
      mockedResolve.mockResolvedValueOnce(service);

      await run('ai', 'token', 'list', 'my-llm');

      const output = printedOutput();
      expect(output).toContain('tok-aaaa');
      expect(output).toContain('web-app');
      expect(output).toContain('…x7f2');
    });
  });

  describe('token revoke', () => {
    it('aborts when the confirmation is declined', async () => {
      mockedPrompt.mockResolvedValueOnce('n');

      await run('ai', 'token', 'revoke', 'my-llm', 'tok-aaaa');

      expect(mockedRevokeToken).not.toHaveBeenCalled();
      expect(printedOutput()).toContain('Aborted.');
    });

    it('revokes with -y and warns about the brief restart', async () => {
      mockedRevokeToken.mockResolvedValueOnce({
        service,
        token: service.tokens[0],
        revoked: true
      });

      await run('ai', 'token', 'revoke', 'my-llm', 'tok-aaaa', '-y');

      expect(mockedRevokeToken).toHaveBeenCalledWith('my-llm', 'tok-aaaa');
      expect(printedOutput()).toContain('restarts briefly');
    });

    it('fails fast without a TTY when -y is not passed', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });

      await expect(run('ai', 'token', 'revoke', 'my-llm', 'tok-aaaa')).rejects.toThrow(
        'process.exit(1)'
      );

      expect(printedErrors()).toContain('not interactive');
      expect(mockedPrompt).not.toHaveBeenCalled();
      expect(mockedRevokeToken).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('aborts when the confirmation is declined', async () => {
      mockedPrompt.mockResolvedValueOnce('n');

      await run('ai', 'delete', 'my-llm');

      expect(mockedDelete).not.toHaveBeenCalled();
      expect(printedOutput()).toContain('Aborted.');
    });

    it('deletes with -y', async () => {
      mockedDelete.mockResolvedValueOnce({ service, deleted: true });

      await run('ai', 'delete', 'my-llm', '-y');

      expect(mockedDelete).toHaveBeenCalledWith('my-llm');
    });

    it('fails fast without a TTY when -y is not passed', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });

      await expect(run('ai', 'delete', 'my-llm')).rejects.toThrow('process.exit(1)');

      expect(printedErrors()).toContain('not interactive');
      expect(mockedPrompt).not.toHaveBeenCalled();
      expect(mockedDelete).not.toHaveBeenCalled();
    });
  });
});
