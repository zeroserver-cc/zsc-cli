import {
  setAppSecretUseCase,
  listAppSecretsUseCase,
  deleteAppSecretUseCase,
  importAppSecretsUseCase
} from '../SecretsUseCase';
import { parseEnvFile } from '../../manifest/envFile';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import {
  MY_APPLICATIONS_QUERY,
  APP_SECRETS_QUERY,
  UPSERT_APP_SECRET_MUTATION,
  DELETE_APP_SECRET_MUTATION
} from '../../../infrastructure/graphql/queries';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

const apps = [
  { id: 'app-42', name: 'site' },
  { id: 'app-7', name: 'api' }
];

function mockAppsOnly() {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: apps } as any;
    throw new Error(`unexpected query: ${query}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
});

it('set resolves the app by name and sends id, key and value', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: apps } as any;
    if (query === UPSERT_APP_SECRET_MUTATION) return { upsertAppSecret: true } as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await setAppSecretUseCase('site', 'API_TOKEN', 'super-secret');

  const vars = mockGql.mock.calls.find((c) => c[0] === UPSERT_APP_SECRET_MUTATION)![1] as any;
  expect(vars).toEqual({ applicationId: 'app-42', key: 'API_TOKEN', value: 'super-secret' });
});

it('set also resolves the app by id', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: apps } as any;
    if (query === UPSERT_APP_SECRET_MUTATION) return { upsertAppSecret: true } as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await setAppSecretUseCase('app-7', 'K', 'v');

  const vars = mockGql.mock.calls.find((c) => c[0] === UPSERT_APP_SECRET_MUTATION)![1] as any;
  expect(vars).toEqual({ applicationId: 'app-7', key: 'K', value: 'v' });
});

it('set fails with the available app names when the app does not exist', async () => {
  mockAppsOnly();
  await expect(setAppSecretUseCase('nope', 'K', 'v')).rejects.toThrow(/not found.*site, api/);
});

it('list returns key, hint and updatedAt only', async () => {
  const secret = { key: 'API_TOKEN', hint: 'cret', updatedAt: '2026-08-10T00:00:00Z' };
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: apps } as any;
    if (query === APP_SECRETS_QUERY) return { appSecrets: [secret] } as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await listAppSecretsUseCase('site');

  const vars = mockGql.mock.calls.find((c) => c[0] === APP_SECRETS_QUERY)![1] as any;
  expect(vars).toEqual({ applicationId: 'app-42' });
  expect(result).toEqual([secret]);
});

it('delete returns the API result', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: apps } as any;
    if (query === DELETE_APP_SECRET_MUTATION) return { deleteAppSecret: true } as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await expect(deleteAppSecretUseCase('site', 'API_TOKEN')).resolves.toBe(true);

  const vars = mockGql.mock.calls.find((c) => c[0] === DELETE_APP_SECRET_MUTATION)![1] as any;
  expect(vars).toEqual({ applicationId: 'app-42', key: 'API_TOKEN' });
});

it('import upserts every parsed var of a .env body (comments, quotes, malformed lines)', async () => {
  const { vars, malformedLines } = parseEnvFile(
    '# comment\n\nGOOD=1\nnot-a-var\nQUOTED="two words"\nSINGLE=\'x\'\nexport EXPORTED=2\n'
  );
  expect(malformedLines).toEqual([4, 7]);
  expect(vars).toEqual([
    ['GOOD', '1'],
    ['QUOTED', 'two words'],
    ['SINGLE', 'x']
  ]);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: apps } as any;
    if (query === UPSERT_APP_SECRET_MUTATION) return { upsertAppSecret: true } as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await importAppSecretsUseCase('site', vars);

  expect(result).toEqual({ imported: 3, failures: [] });
  const sent = mockGql.mock.calls
    .filter((c) => c[0] === UPSERT_APP_SECRET_MUTATION)
    .map((c) => c[1] as any);
  expect(sent).toEqual([
    { applicationId: 'app-42', key: 'GOOD', value: '1' },
    { applicationId: 'app-42', key: 'QUOTED', value: 'two words' },
    { applicationId: 'app-42', key: 'SINGLE', value: 'x' }
  ]);
});

it('import records a failing key and continues the batch', async () => {
  mockGql.mockImplementation(async (query: string, variables?: unknown) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: apps } as any;
    if (query === UPSERT_APP_SECRET_MUTATION) {
      if ((variables as any).key === 'BAD') throw new Error('backend rejected the value');
      return { upsertAppSecret: true } as any;
    }
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await importAppSecretsUseCase('site', [
    ['A', '1'],
    ['BAD', '2'],
    ['C', '3']
  ]);

  expect(result.imported).toBe(2);
  expect(result.failures).toEqual([{ key: 'BAD', error: 'backend rejected the value' }]);
});

it('all commands require a login token', async () => {
  (getConfigValue as jest.Mock).mockReturnValue(undefined);
  await expect(listAppSecretsUseCase('site')).rejects.toThrow(/Not logged in/);
});
