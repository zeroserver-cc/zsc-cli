import { deployApplicationUseCase } from '../DeployApplicationUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import { waitForInstance } from '../waitForInstance';
import {
  CREATE_APPLICATION_MUTATION,
  DEPLOY_APPLICATION_MUTATION,
  MY_APPLICATIONS_QUERY,
} from '../../../infrastructure/graphql/queries';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store');
jest.mock('../waitForInstance');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
  (waitForInstance as jest.Mock).mockResolvedValue({ instance: { id: 'inst-1', status: 'RUNNING' }, timedOut: false });
});

function deployReturns(id = 'inst-1') {
  return { deployApplication: { id, status: 'PENDING' } };
}

it('reuses an existing application with the same name (no create) so the URL stays stable', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [{ id: 'app-42', name: 'zeroserver-website' }] } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployReturns() as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await deployApplicationUseCase({ image: 'ghcr.io/x/site:abc', name: 'zeroserver-website', port: 3000, env: [] });

  const queries = mockGql.mock.calls.map((c) => c[0]);
  expect(queries).not.toContain(CREATE_APPLICATION_MUTATION);
  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input.applicationId).toBe('app-42');
  expect(deployVars.input.containerName).toBe('zeroserver-website'); // stable, not timestamped
});

it('creates the application the first time when none matches the name', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [] } as any;
    if (query === CREATE_APPLICATION_MUTATION) return { createApplication: { id: 'app-new' } } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployReturns() as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await deployApplicationUseCase({ image: 'ghcr.io/x/site:abc', name: 'zeroserver-website', port: 3000, env: [] });

  const queries = mockGql.mock.calls.map((c) => c[0]);
  expect(queries).toContain(CREATE_APPLICATION_MUTATION);
  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input.applicationId).toBe('app-new');
});
