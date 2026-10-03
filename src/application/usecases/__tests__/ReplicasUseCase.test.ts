import { scaleApplicationUseCase, readReplicaOutcome } from '../ReplicasUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import {
  APPLICATION_REPLICA_STATUS_QUERY,
  MY_APPLICATIONS_QUERY,
  SCALE_APPLICATION_MUTATION
} from '../../../infrastructure/graphql/queries';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

const scaled = {
  id: 'app-42',
  name: 'site',
  desiredReplicas: 3,
  effectiveReplicas: 1,
  runningReplicas: 1,
  replicaWarnings: ['Apps with volumes keep a single replica.']
};

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
});

describe('scaleApplicationUseCase', () => {
  it('resolves the app by name, scales it and returns the desired, effective and running counts', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === MY_APPLICATIONS_QUERY)
        return { myApplications: [{ id: 'app-42', name: 'site' }] } as any;
      if (query === SCALE_APPLICATION_MUTATION) return { scaleApplication: scaled } as any;
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await scaleApplicationUseCase('site', 3);

    expect(mockGql.mock.calls.find((c) => c[0] === SCALE_APPLICATION_MUTATION)![1]).toEqual({
      applicationId: 'app-42',
      replicas: 3
    });
    expect(result.appName).toBe('site');
    expect(result.status).toMatchObject({
      desiredReplicas: 3,
      effectiveReplicas: 1,
      runningReplicas: 1,
      replicaWarnings: ['Apps with volumes keep a single replica.']
    });
  });

  it('accepts an application id as well as a name', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === MY_APPLICATIONS_QUERY)
        return { myApplications: [{ id: 'app-42', name: 'site' }] } as any;
      if (query === SCALE_APPLICATION_MUTATION) return { scaleApplication: scaled } as any;
      throw new Error(`unexpected query: ${query}`);
    });

    await scaleApplicationUseCase('app-42', 2);

    expect(
      (mockGql.mock.calls.find((c) => c[0] === SCALE_APPLICATION_MUTATION)![1] as any).applicationId
    ).toBe('app-42');
  });

  it('fails with the available names when the application does not exist', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === MY_APPLICATIONS_QUERY)
        return { myApplications: [{ id: 'a1', name: 'other' }] } as any;
      throw new Error(`unexpected query: ${query}`);
    });

    await expect(scaleApplicationUseCase('site', 2)).rejects.toThrow(/not found.*other/);
  });

  it('turns an unknown scaleApplication mutation into the unsupported-backend message', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === MY_APPLICATIONS_QUERY)
        return { myApplications: [{ id: 'app-42', name: 'site' }] } as any;
      throw new Error('Cannot query field "scaleApplication" on type "Mutation".');
    });

    await expect(scaleApplicationUseCase('site', 2)).rejects.toThrow(
      'This backend does not support replicas yet'
    );
  });

  it('keeps backend errors that are not about missing replica support', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === MY_APPLICATIONS_QUERY)
        return { myApplications: [{ id: 'app-42', name: 'site' }] } as any;
      throw new Error('replicas must be at most 100');
    });

    await expect(scaleApplicationUseCase('site', 500)).rejects.toThrow(
      'replicas must be at most 100'
    );
  });

  it('requires a login token', async () => {
    (getConfigValue as jest.Mock).mockReturnValue(undefined);

    await expect(scaleApplicationUseCase('site', 2)).rejects.toThrow(/Not logged in/);
    expect(mockGql).not.toHaveBeenCalled();
  });
});

describe('readReplicaOutcome', () => {
  it('returns only the request when the application is not found', async () => {
    mockGql.mockResolvedValue({ application: null } as any);

    await expect(readReplicaOutcome(3, 'app-42', 'a-token')).resolves.toEqual({ requested: 3 });
    expect(mockGql.mock.calls[0][0]).toBe(APPLICATION_REPLICA_STATUS_QUERY);
  });
});
