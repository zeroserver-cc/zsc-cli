import { listDeploymentsUseCase } from '../ListDeploymentsUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store', () => ({
  ...jest.requireActual('../../../infrastructure/config/store'),
  getConfigValue: jest.fn(),
}));

const mockedGqlRequest = gqlRequest as jest.MockedFunction<typeof gqlRequest>;
const mockedGetConfigValue = getConfigValue as jest.MockedFunction<typeof getConfigValue>;

const apps = [
  { id: 'app-1', name: 'api', dockerImage: 'img:latest', createdAt: '2026-07-01T00:00:00Z' },
  { id: 'app-2', name: 'worker', dockerImage: 'img2:latest', createdAt: '2026-07-01T00:00:00Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetConfigValue.mockImplementation((key) => (key === 'accessToken' ? 'token-a' : undefined));
});

describe('listDeploymentsUseCase', () => {
  it('resolves the app by name and fetches its deployment history', async () => {
    const deployments = [
      { id: 'dep-1', image: 'img:v2', status: 'SUCCESS', createdAt: '2026-07-27T10:00:00Z', finishedAt: '2026-07-27T10:00:42Z' },
    ];
    mockedGqlRequest
      .mockResolvedValueOnce({ myApplications: apps })
      .mockResolvedValueOnce({ deployments });

    const result = await listDeploymentsUseCase('worker');

    expect(result).toEqual(deployments);
    expect(mockedGqlRequest).toHaveBeenNthCalledWith(2, expect.stringContaining('deployments'), {
      applicationId: 'app-2',
      limit: 20,
    }, 'token-a');
  });

  it('returns an empty history as-is', async () => {
    mockedGqlRequest
      .mockResolvedValueOnce({ myApplications: apps })
      .mockResolvedValueOnce({ deployments: [] });

    await expect(listDeploymentsUseCase('api')).resolves.toEqual([]);
  });

  it('fails with the available app names when the app does not exist', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ myApplications: apps });

    await expect(listDeploymentsUseCase('nope')).rejects.toThrow(
      'Application "nope" not found. Your applications: api, worker',
    );
    expect(mockedGqlRequest).toHaveBeenCalledTimes(1);
  });

  it('requires a logged-in session', async () => {
    mockedGetConfigValue.mockReturnValue(undefined);

    await expect(listDeploymentsUseCase('api')).rejects.toThrow('Not logged in');
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });
});
