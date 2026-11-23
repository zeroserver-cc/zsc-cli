import {
  createStorageKeyUseCase,
  createStorageUseCase,
  deleteStorageUseCase,
  findAccessKey,
  getStorageUsageUseCase,
  isLastActiveKey,
  resolveStorageUseCase,
  revokeStorageKeyUseCase
} from '../ManagedStorageUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import {
  CREATE_MANAGED_STORAGE_ACCESS_KEY_MUTATION,
  CREATE_MANAGED_STORAGE_MUTATION,
  DELETE_MANAGED_STORAGE_MUTATION,
  REVOKE_MANAGED_STORAGE_ACCESS_KEY_MUTATION
} from '../../../infrastructure/graphql/queries';
import { ManagedStorage, ManagedStorageAccessKey } from '../../../domain/entities/types';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

const key = (overrides: Partial<ManagedStorageAccessKey>): ManagedStorageAccessKey => ({
  id: 'key-1',
  accessKeyId: 'ZSCAAAA',
  label: 'ci',
  status: 'ACTIVE',
  createdAt: '2026-11-01T00:00:00.000Z',
  revokedAt: null,
  ...overrides
});

const storage = (overrides: Partial<ManagedStorage>): ManagedStorage => ({
  id: 'aaaa1111-0000',
  name: 'media',
  status: 'RUNNING',
  quotaGb: 10,
  egressQuotaGb: 50,
  quotaExceeded: false,
  quotaExceededReason: null,
  usage: { monitored: true, writesBlockEnforced: true },
  endpoint: 'https://media.s3.zeroserver.cc',
  region: 'zsc-br',
  accessKeys: [key({})],
  replication: { state: 'PROTECTED', rpoSeconds: 300 },
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
});

describe('resolveStorageUseCase', () => {
  it('resolves by exact name', async () => {
    mockGql.mockResolvedValue({
      managedStorages: [storage({}), storage({ id: 'b', name: 'x' })]
    } as any);
    expect((await resolveStorageUseCase('media')).id).toBe('aaaa1111-0000');
  });

  it('resolves by unambiguous id prefix', async () => {
    mockGql.mockResolvedValue({ managedStorages: [storage({})] } as any);
    expect((await resolveStorageUseCase('aaaa')).name).toBe('media');
  });

  it('rejects an ambiguous id prefix', async () => {
    mockGql.mockResolvedValue({
      managedStorages: [storage({}), storage({ id: 'aaaa2222', name: 'other' })]
    } as any);
    await expect(resolveStorageUseCase('aaaa')).rejects.toThrow(/Ambiguous/);
  });

  it('rejects an unknown storage', async () => {
    mockGql.mockResolvedValue({ managedStorages: [] } as any);
    await expect(resolveStorageUseCase('nope')).rejects.toThrow(/Unknown storage/);
  });

  it('requires a session', async () => {
    (getConfigValue as jest.Mock).mockReturnValue(undefined);
    await expect(resolveStorageUseCase('media')).rejects.toThrow(/Not logged in/);
  });
});

describe('createStorageUseCase', () => {
  it('omits quotas that were not given so platform defaults apply', async () => {
    mockGql.mockResolvedValue({ createManagedStorage: { storage: storage({}) } } as any);
    await createStorageUseCase('media');
    expect(mockGql).toHaveBeenCalledWith(
      CREATE_MANAGED_STORAGE_MUTATION,
      { input: { name: 'media' } },
      'a-token'
    );
  });

  it('sends the quotas when given', async () => {
    mockGql.mockResolvedValue({ createManagedStorage: { storage: storage({}) } } as any);
    await createStorageUseCase('media', 20, 100);
    expect(mockGql.mock.calls[0][1]).toEqual({
      input: { name: 'media', quotaGb: 20, egressQuotaGb: 100 }
    });
  });
});

describe('deleteStorageUseCase', () => {
  it('deletes the resolved storage by id', async () => {
    mockGql
      .mockResolvedValueOnce({ managedStorages: [storage({})] } as any)
      .mockResolvedValueOnce({ deleteManagedStorage: true } as any);
    const result = await deleteStorageUseCase('media');
    expect(mockGql).toHaveBeenLastCalledWith(
      DELETE_MANAGED_STORAGE_MUTATION,
      { id: 'aaaa1111-0000' },
      'a-token'
    );
    expect(result.deleted).toBe(true);
  });
});

describe('getStorageUsageUseCase', () => {
  it('returns the series of the resolved storage', async () => {
    mockGql.mockResolvedValueOnce({ managedStorages: [storage({})] } as any).mockResolvedValueOnce({
      managedStorageUsage: { storageId: 'aaaa1111-0000', days: [] }
    } as any);
    const { usage } = await getStorageUsageUseCase('media');
    expect(usage.storageId).toBe('aaaa1111-0000');
  });
});

describe('access keys', () => {
  it('creates a key with the label', async () => {
    mockGql.mockResolvedValueOnce({ managedStorages: [storage({})] } as any).mockResolvedValueOnce({
      createManagedStorageAccessKey: { id: 'k2', secretAccessKey: 's' }
    } as any);
    const { accessKey } = await createStorageKeyUseCase('media', 'ci');
    expect(mockGql).toHaveBeenLastCalledWith(
      CREATE_MANAGED_STORAGE_ACCESS_KEY_MUTATION,
      { storageId: 'aaaa1111-0000', label: 'ci' },
      'a-token'
    );
    expect(accessKey.id).toBe('k2');
  });

  it('finds a key by id, prefix or access key id', () => {
    const s = storage({ accessKeys: [key({}), key({ id: 'key-2', accessKeyId: 'ZSCBBBB' })] });
    expect(findAccessKey(s, 'key-2').accessKeyId).toBe('ZSCBBBB');
    expect(findAccessKey(s, 'ZSCAAAA').id).toBe('key-1');
    expect(() => findAccessKey(s, 'key-')).toThrow(/Ambiguous/);
    expect(() => findAccessKey(s, 'zzz')).toThrow(/Unknown key/);
  });

  it('detects the last active key and ignores revoked ones', () => {
    const s = storage({ accessKeys: [key({}), key({ id: 'key-2', status: 'REVOKED' })] });
    expect(isLastActiveKey(s, s.accessKeys[0])).toBe(true);
    expect(isLastActiveKey(s, s.accessKeys[1])).toBe(false);
    const two = storage({ accessKeys: [key({}), key({ id: 'key-3' })] });
    expect(isLastActiveKey(two, two.accessKeys[0])).toBe(false);
  });

  it('revokes by key id', async () => {
    mockGql.mockResolvedValue({ revokeManagedStorageAccessKey: true } as any);
    const s = storage({});
    expect(await revokeStorageKeyUseCase(s, s.accessKeys[0])).toBe(true);
    expect(mockGql).toHaveBeenCalledWith(
      REVOKE_MANAGED_STORAGE_ACCESS_KEY_MUTATION,
      { storageId: 'aaaa1111-0000', keyId: 'key-1' },
      'a-token'
    );
  });
});
