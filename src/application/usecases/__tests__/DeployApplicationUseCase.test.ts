import { deployApplicationUseCase } from '../DeployApplicationUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import { waitForInstance } from '../waitForInstance';
import {
  APPLICATION_REPLICA_STATUS_QUERY,
  CREATE_APPLICATION_MUTATION,
  DEPLOY_APPLICATION_MUTATION,
  MY_APPLICATIONS_QUERY
} from '../../../infrastructure/graphql/queries';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store');
jest.mock('../waitForInstance');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
  (waitForInstance as jest.Mock).mockResolvedValue({
    instance: { id: 'inst-1', status: 'RUNNING' },
    timedOut: false
  });
});

const deployOk = { deployApplication: { id: 'inst-1', status: 'PENDING' } };

it('deploys to a fixed --app-id without any lookup or create', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await deployApplicationUseCase({
    image: 'ghcr.io/x/site:abc',
    appId: 'app-pinned',
    port: 3000,
    env: []
  });

  const queries = mockGql.mock.calls.map((c) => c[0]);
  expect(queries).not.toContain(MY_APPLICATIONS_QUERY);
  expect(queries).not.toContain(CREATE_APPLICATION_MUTATION);
  const deployVars = mockGql.mock.calls.find(
    (c) => c[0] === DEPLOY_APPLICATION_MUTATION
  )![1] as any;
  expect(deployVars.input.applicationId).toBe('app-pinned');
});

it('reuses an existing application by name (no create) when no --app-id', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY)
      return { myApplications: [{ id: 'app-42', name: 'site' }] } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await deployApplicationUseCase({
    image: 'ghcr.io/x/site:abc',
    name: 'site',
    port: 3000,
    env: []
  });

  const queries = mockGql.mock.calls.map((c) => c[0]);
  expect(queries).not.toContain(CREATE_APPLICATION_MUTATION);
  const deployVars = mockGql.mock.calls.find(
    (c) => c[0] === DEPLOY_APPLICATION_MUTATION
  )![1] as any;
  expect(deployVars.input.applicationId).toBe('app-42');
  expect(deployVars.input.containerName).toBe('site');
});

it('creates the application the first time when none matches', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [] } as any;
    if (query === CREATE_APPLICATION_MUTATION)
      return { createApplication: { id: 'app-new' } } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await deployApplicationUseCase({
    image: 'ghcr.io/x/site:abc',
    name: 'site',
    port: 3000,
    env: []
  });

  expect(mockGql.mock.calls.map((c) => c[0])).toContain(CREATE_APPLICATION_MUTATION);
  const deployVars = mockGql.mock.calls.find(
    (c) => c[0] === DEPLOY_APPLICATION_MUTATION
  )![1] as any;
  expect(deployVars.input.applicationId).toBe('app-new');
});

it('forwards the placement preference uppercased as preferredCountry/preferredRegion', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await deployApplicationUseCase({
    image: 'ghcr.io/x/site:abc',
    appId: 'app-pinned',
    env: [],
    country: 'br',
    region: 'rs'
  });

  const deployVars = mockGql.mock.calls.find(
    (c) => c[0] === DEPLOY_APPLICATION_MUTATION
  )![1] as any;
  expect(deployVars.input.preferredCountry).toBe('BR');
  expect(deployVars.input.preferredRegion).toBe('RS');
});

it('omits the placement fields when no preference is given', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await deployApplicationUseCase({ image: 'ghcr.io/x/site:abc', appId: 'app-pinned', env: [] });

  const deployVars = mockGql.mock.calls.find(
    (c) => c[0] === DEPLOY_APPLICATION_MUTATION
  )![1] as any;
  expect(deployVars.input).not.toHaveProperty('preferredCountry');
  expect(deployVars.input).not.toHaveProperty('preferredRegion');
});

describe('replicas', () => {
  const deployVarsOf = () =>
    mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;

  const statusReply = {
    application: {
      id: 'app-pinned',
      name: 'site',
      desiredReplicas: 3,
      effectiveReplicas: 3,
      runningReplicas: 1,
      replicaWarnings: []
    }
  };

  it('sends replicas on the deploy input only when requested and reads the status afterwards', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
      if (query === APPLICATION_REPLICA_STATUS_QUERY) return statusReply as any;
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await deployApplicationUseCase({
      image: 'ghcr.io/x/site:abc',
      appId: 'app-pinned',
      env: [],
      replicas: 3
    });

    expect(deployVarsOf().input.replicas).toBe(3);
    expect(mockGql.mock.calls.find((c) => c[0] === APPLICATION_REPLICA_STATUS_QUERY)![1]).toEqual({
      id: 'app-pinned'
    });
    expect(result.replicas).toMatchObject({
      requested: 3,
      status: { desiredReplicas: 3, effectiveReplicas: 3, runningReplicas: 1 }
    });
  });

  it('keeps the payload and the queries untouched when no replicas were requested', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await deployApplicationUseCase({
      image: 'ghcr.io/x/site:abc',
      appId: 'app-pinned',
      env: []
    });

    expect(deployVarsOf().input).not.toHaveProperty('replicas');
    expect(mockGql.mock.calls.map((c) => c[0])).toEqual([DEPLOY_APPLICATION_MUTATION]);
    expect(result.replicas).toBeUndefined();
  });

  it('still reports the deploy when the replica status cannot be read afterwards', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
      throw new Error('boom');
    });

    const result = await deployApplicationUseCase({
      image: 'ghcr.io/x/site:abc',
      appId: 'app-pinned',
      env: [],
      replicas: 2
    });

    expect(result.instance.status).toBe('RUNNING');
    expect(result.replicas).toEqual({ requested: 2 });
  });

  it('turns the schema error of a backend without replicas into a clear message', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === DEPLOY_APPLICATION_MUTATION) {
        throw new Error(
          'Variable "$input" got invalid value 3 at "input.replicas"; Field "replicas" is not defined by type "DeployApplicationInput".'
        );
      }
      throw new Error(`unexpected query: ${query}`);
    });

    await expect(
      deployApplicationUseCase({
        image: 'ghcr.io/x/site:abc',
        appId: 'app-pinned',
        env: [],
        replicas: 3
      })
    ).rejects.toThrow('This backend does not support replicas yet');
  });

  it('does not rewrite unrelated deploy errors', async () => {
    mockGql.mockImplementation(async () => {
      throw new Error('No eligible node');
    });

    await expect(
      deployApplicationUseCase({
        image: 'ghcr.io/x/site:abc',
        appId: 'app-pinned',
        env: [],
        replicas: 3
      })
    ).rejects.toThrow('No eligible node');
  });
});
