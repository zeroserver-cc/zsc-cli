import {
  createDatabaseUseCase,
  deleteDatabaseUseCase,
  getConnectionStringUseCase,
  listDatabasesUseCase,
  resolveDatabaseUseCase,
  restoreDatabaseUseCase,
} from '../ManagedDatabaseUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import {
  CREATE_MANAGED_DATABASE_MUTATION,
  DELETE_MANAGED_DATABASE_MUTATION,
  MANAGED_DATABASE_CONNECTION_STRING_QUERY,
  MY_DATABASES_QUERY,
  RESTORE_MANAGED_DATABASE_MUTATION,
} from '../../../infrastructure/graphql/queries';
import { ManagedDatabase } from '../../../domain/entities/types';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

const db = (overrides: Partial<ManagedDatabase>): ManagedDatabase => ({
  id: 'db-1',
  name: 'app-db',
  engine: 'POSTGRES',
  version: '16',
  status: 'RUNNING',
  machineId: 'machine-1',
  lastDumpAt: '2026-08-04T12:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
});

describe('listDatabasesUseCase', () => {
  it('returns the databases from myDatabases', async () => {
    mockGql.mockResolvedValue({ myDatabases: [db({})] } as any);

    const result = await listDatabasesUseCase();

    expect(mockGql).toHaveBeenCalledWith(MY_DATABASES_QUERY, {}, 'a-token');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('app-db');
  });

  it('fails early when there is no session token', async () => {
    (getConfigValue as jest.Mock).mockReturnValue(undefined);

    await expect(listDatabasesUseCase()).rejects.toThrow('Not logged in. Run "zs login" first.');
    expect(mockGql).not.toHaveBeenCalled();
  });
});

describe('resolveDatabaseUseCase', () => {
  it('resolves an exact name match', async () => {
    mockGql.mockResolvedValue({ myDatabases: [db({}), db({ id: 'db-2', name: 'other' })] } as any);

    const result = await resolveDatabaseUseCase('other');

    expect(result.id).toBe('db-2');
  });

  it('resolves a unique id prefix', async () => {
    mockGql.mockResolvedValue({
      myDatabases: [db({ id: 'abc-111' }), db({ id: 'def-222', name: 'other' })],
    } as any);

    const result = await resolveDatabaseUseCase('def-');

    expect(result.id).toBe('def-222');
  });

  it('fails on an ambiguous id prefix', async () => {
    mockGql.mockResolvedValue({
      myDatabases: [db({ id: 'abc-111' }), db({ id: 'abc-222', name: 'other' })],
    } as any);

    await expect(resolveDatabaseUseCase('abc')).rejects.toThrow(/Ambiguous database id prefix "abc" \(2 matches\)/);
  });

  it('fails on an ambiguous name', async () => {
    mockGql.mockResolvedValue({
      myDatabases: [db({}), db({ id: 'db-2' })],
    } as any);

    await expect(resolveDatabaseUseCase('app-db')).rejects.toThrow(/Ambiguous database name "app-db" \(2 matches\)/);
  });

  it('fails when nothing matches', async () => {
    mockGql.mockResolvedValue({ myDatabases: [db({})] } as any);

    await expect(resolveDatabaseUseCase('nope')).rejects.toThrow(
      'Unknown database "nope". Run "zs db list" to see your managed databases.',
    );
  });
});

describe('createDatabaseUseCase', () => {
  it('sends the create mutation with the uppercased engine enum', async () => {
    mockGql.mockResolvedValue({ createManagedDatabase: db({ status: 'PENDING' }) } as any);

    const result = await createDatabaseUseCase('app-db', 'POSTGRES');

    expect(mockGql).toHaveBeenCalledWith(
      CREATE_MANAGED_DATABASE_MUTATION,
      { input: { name: 'app-db', engine: 'POSTGRES' } },
      'a-token',
    );
    expect(result.status).toBe('PENDING');
  });
});

describe('getConnectionStringUseCase', () => {
  it('resolves the target and fetches the connection string by id', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === MY_DATABASES_QUERY) return { myDatabases: [db({})] } as any;
      if (query === MANAGED_DATABASE_CONNECTION_STRING_QUERY) {
        return { managedDatabaseConnectionString: 'postgres://u:p@host:5432/app' } as any;
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await getConnectionStringUseCase('app-db');

    const connCall = mockGql.mock.calls.find((c) => c[0] === MANAGED_DATABASE_CONNECTION_STRING_QUERY)!;
    expect(connCall[1]).toEqual({ id: 'db-1' });
    expect(result.url).toBe('postgres://u:p@host:5432/app');
    expect(result.database.name).toBe('app-db');
  });

  it('does not fetch the connection string when the target does not resolve', async () => {
    mockGql.mockResolvedValue({ myDatabases: [] } as any);

    await expect(getConnectionStringUseCase('nope')).rejects.toThrow(/Unknown database "nope"/);
    expect(mockGql.mock.calls.map((c) => c[0])).not.toContain(MANAGED_DATABASE_CONNECTION_STRING_QUERY);
  });
});

describe('deleteDatabaseUseCase', () => {
  it('resolves the target and deletes by id', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === MY_DATABASES_QUERY) return { myDatabases: [db({})] } as any;
      if (query === DELETE_MANAGED_DATABASE_MUTATION) return { deleteManagedDatabase: true } as any;
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await deleteDatabaseUseCase('app-db');

    const deleteCall = mockGql.mock.calls.find((c) => c[0] === DELETE_MANAGED_DATABASE_MUTATION)!;
    expect(deleteCall[1]).toEqual({ id: 'db-1' });
    expect(result.deleted).toBe(true);
    expect(result.database.name).toBe('app-db');
  });
});

describe('restoreDatabaseUseCase', () => {
  it('resolves the target and restores by id', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === MY_DATABASES_QUERY) return { myDatabases: [db({})] } as any;
      if (query === RESTORE_MANAGED_DATABASE_MUTATION) return { restoreManagedDatabase: true } as any;
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await restoreDatabaseUseCase('app-db');

    const restoreCall = mockGql.mock.calls.find((c) => c[0] === RESTORE_MANAGED_DATABASE_MUTATION)!;
    expect(restoreCall[1]).toEqual({ id: 'db-1' });
    expect(result.restored).toBe(true);
  });
});
