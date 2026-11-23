import { AxiosError } from 'axios';
import { Command } from 'commander';
import { registerStorageCommands } from '../storage';
import * as useCases from '../../../application/usecases/ManagedStorageUseCase';
import { handleError } from '../../formatting/errors';
import { prompt } from '../../io/prompt';
import { ManagedStorage, ManagedStorageAccessKey } from '../../../domain/entities/types';

jest.mock('../../../application/usecases/ManagedStorageUseCase', () => ({
  ...jest.requireActual('../../../application/usecases/ManagedStorageUseCase'),
  resolveStorageUseCase: jest.fn(),
  createStorageUseCase: jest.fn(),
  createStorageKeyUseCase: jest.fn(),
  deleteStorageUseCase: jest.fn(),
  revokeStorageKeyUseCase: jest.fn(),
  listStoragesUseCase: jest.fn(),
  getStorageUsageUseCase: jest.fn()
}));
jest.mock('../../../application/usecases/requireRole');
jest.mock('../../formatting/errors', () => ({ handleError: jest.fn() }));
jest.mock('../../io/prompt', () => ({ prompt: jest.fn() }));
jest.mock('ora', () => () => ({
  start() {
    return this;
  },
  succeed: jest.fn(),
  warn: jest.fn(),
  stop: jest.fn(),
  fail: jest.fn()
}));

const resolveMock = useCases.resolveStorageUseCase as jest.Mock;
const createMock = useCases.createStorageUseCase as jest.Mock;
const deleteMock = useCases.deleteStorageUseCase as jest.Mock;
const revokeMock = useCases.revokeStorageKeyUseCase as jest.Mock;
const promptMock = prompt as jest.Mock;
const errorMock = handleError as unknown as jest.Mock;

const SECRET = 'THE-SECRET-VALUE';
const key = (over: Partial<ManagedStorageAccessKey>): ManagedStorageAccessKey => ({
  id: 'key-11112222',
  accessKeyId: 'AKID',
  label: 'ci',
  status: 'ACTIVE',
  createdAt: '2026-11-01T00:00:00.000Z',
  ...over
});
const storage = (over: Partial<ManagedStorage> = {}): ManagedStorage =>
  ({
    id: 'aaaa1111-0000-4000',
    name: 'media',
    status: 'RUNNING',
    endpoint: 'https://media.s3.zeroserver.cc',
    region: 'zsc-br',
    accessKeys: [key({})],
    ...over
  }) as ManagedStorage;

let out: string[];
let err: string[];

async function run(...args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerStorageCommands(program);
  await program.parseAsync(['node', 'zs', 'storage', ...args]);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.exitCode = 0;
  out = [];
  err = [];
  jest.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
  jest.spyOn(console, 'error').mockImplementation((...a) => void err.push(a.join(' ')));
  resolveMock.mockResolvedValue(storage());
  deleteMock.mockResolvedValue(true);
  revokeMock.mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
  process.exitCode = 0;
});

describe('zs storage create', () => {
  const created = (status: string) => ({
    storage: storage({ status } as Partial<ManagedStorage>),
    accessKey: { id: 'k', accessKeyId: 'AKID', secretAccessKey: SECRET, label: '', createdAt: '' }
  });

  it('prints the secret exactly once and never the aws mb example', async () => {
    createMock.mockResolvedValue(created('RUNNING'));
    await run('create', 'media');
    const text = out.join('\n');
    expect(text.split(SECRET).length - 1).toBe(1);
    expect(text).toContain('version control');
    expect(text).toContain('AWS_ENDPOINT_URL=https://media.s3.zeroserver.cc');
    expect(text).not.toContain('s3 mb');
    expect(text).toContain('not billed yet');
  });

  it('tells the user to wait for RUNNING when the storage is not running yet', async () => {
    createMock.mockResolvedValue(created('PENDING'));
    await run('create', 'media');
    expect(out.join('\n')).toMatch(/still starting.*zs storage info media/);
  });

  it('warns that the storage may exist after a timeout', async () => {
    createMock.mockRejectedValue(new AxiosError('timeout', 'ECONNABORTED'));
    await run('create', 'media');
    expect(err.join('\n')).toMatch(
      /may have been created.*zs storage list.*zs storage keys create media/
    );
    expect(errorMock).toHaveBeenCalled();
  });

  it('rejects an invalid name locally with a clear prefix', async () => {
    await run('create', 'Bad_Name');
    expect(createMock).not.toHaveBeenCalled();
    expect((errorMock.mock.calls[0][0] as Error).message).toMatch(/^Invalid storage name:/);
  });
});

describe('zs storage delete', () => {
  it('resolves first and shows name and full id in the confirmation', async () => {
    promptMock.mockResolvedValue('y');
    await run('delete', 'media');
    expect(resolveMock).toHaveBeenCalledWith('media', { destructive: true });
    expect(promptMock.mock.calls[0][0]).toContain('media (aaaa1111-0000-4000)');
    expect(deleteMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'aaaa1111-0000-4000' }));
  });

  it('accepts "yes"', async () => {
    promptMock.mockResolvedValue('YES');
    await run('delete', 'media');
    expect(deleteMock).toHaveBeenCalled();
  });

  it('aborts with a non-zero exit code when declined or unanswered', async () => {
    promptMock.mockResolvedValue('');
    await run('delete', 'media');
    expect(deleteMock).not.toHaveBeenCalled();
    expect(out.join('\n')).toContain('Aborted.');
    expect(process.exitCode).toBe(1);
  });

  it('skips the prompt with --yes but still fails on an ambiguous or short reference', async () => {
    resolveMock.mockRejectedValue(new Error('Ambiguous storage id prefix'));
    await run('delete', 'aaaa1111', '--yes');
    expect(promptMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(errorMock).toHaveBeenCalled();
  });

  it('deletes with --yes when the reference resolves', async () => {
    await run('delete', 'media', '--yes');
    expect(promptMock).not.toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalled();
  });
});

describe('zs storage keys revoke', () => {
  it('warns when it is the last active key and shows storage and key ids', async () => {
    promptMock.mockResolvedValue('y');
    await run('keys', 'revoke', 'media', 'key-11112222');
    const question = promptMock.mock.calls[0][0] as string;
    expect(question).toContain('LAST active key');
    expect(question).toContain('aaaa1111-0000-4000');
    expect(question).toContain('key-11112222');
    expect(revokeMock).toHaveBeenCalled();
  });

  it('does not warn about the last key when another active key remains', async () => {
    resolveMock.mockResolvedValue(
      storage({ accessKeys: [key({}), key({ id: 'key-99998888', accessKeyId: 'AK2' })] })
    );
    promptMock.mockResolvedValue('y');
    await run('keys', 'revoke', 'media', 'key-11112222');
    expect(promptMock.mock.calls[0][0]).not.toContain('LAST');
  });

  it('aborts without revoking when declined', async () => {
    promptMock.mockResolvedValue('n');
    await run('keys', 'revoke', 'media', 'key-11112222');
    expect(revokeMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('says so when the key is already revoked, without prompting or calling the API', async () => {
    resolveMock.mockResolvedValue(storage({ accessKeys: [key({ status: 'REVOKED' })] }));
    await run('keys', 'revoke', 'media', 'key-11112222');
    expect(out.join('\n')).toContain('already revoked');
    expect(promptMock).not.toHaveBeenCalled();
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('rejects a short key prefix even with --yes', async () => {
    await run('keys', 'revoke', 'media', 'key-', '--yes');
    expect(revokeMock).not.toHaveBeenCalled();
    expect((errorMock.mock.calls[0][0] as Error).message).toMatch(/too short/);
  });
});

describe('secret exposure', () => {
  it('keys list never prints a secret', async () => {
    resolveMock.mockResolvedValue(storage());
    await run('keys', 'list', 'media');
    expect(out.join('\n')).not.toMatch(/secret/i);
  });
});
