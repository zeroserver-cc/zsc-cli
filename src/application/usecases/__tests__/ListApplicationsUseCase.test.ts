import { listApplicationsUseCase } from '../ListApplicationsUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store', () => ({
  ...jest.requireActual('../../../infrastructure/config/store'),
  getConfigValue: jest.fn(),
}));

const mockedGqlRequest = gqlRequest as jest.MockedFunction<typeof gqlRequest>;
const mockedGetConfigValue = getConfigValue as jest.MockedFunction<typeof getConfigValue>;

const app = { id: 'app-1', name: 'api', dockerImage: 'img:latest', createdAt: '2026-07-01T00:00:00Z' };

function instance(id: string, status: string, createdAt: string) {
  return { id, applicationId: 'app-1', status, createdAt };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetConfigValue.mockImplementation((key) => (key === 'accessToken' ? 'token-a' : undefined));
});

describe('listApplicationsUseCase (stable-instance model)', () => {
  it('shows the single instance of each app', async () => {
    mockedGqlRequest
      .mockResolvedValueOnce({ myApplications: [app] })
      .mockResolvedValueOnce({ applicationInstancesByApplication: [instance('i-1', 'RUNNING', '2026-07-27T10:00:00Z')] });

    const rows = await listApplicationsUseCase();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ instanceId: 'i-1', status: 'RUNNING', appName: 'api' });
  });

  it('collapses historical dead instances to the newest live one', async () => {
    mockedGqlRequest
      .mockResolvedValueOnce({ myApplications: [app] })
      .mockResolvedValueOnce({
        applicationInstancesByApplication: [
          instance('i-old-dead', 'STOPPED', '2026-07-20T10:00:00Z'),
          instance('i-mid-dead', 'ERROR', '2026-07-25T10:00:00Z'),
          instance('i-live', 'RUNNING', '2026-07-27T10:00:00Z'),
        ],
      });

    const rows = await listApplicationsUseCase();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ instanceId: 'i-live', status: 'RUNNING' });
  });

  it('keeps the newest row when every instance is dead (stopped app stays visible)', async () => {
    mockedGqlRequest
      .mockResolvedValueOnce({ myApplications: [app] })
      .mockResolvedValueOnce({
        applicationInstancesByApplication: [
          instance('i-old', 'STOPPED', '2026-07-20T10:00:00Z'),
          instance('i-new', 'STOPPED', '2026-07-27T10:00:00Z'),
        ],
      });

    const rows = await listApplicationsUseCase();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ instanceId: 'i-new', status: 'STOPPED' });
  });

  it('shows nothing for an app without instances', async () => {
    mockedGqlRequest
      .mockResolvedValueOnce({ myApplications: [app] })
      .mockResolvedValueOnce({ applicationInstancesByApplication: [] });

    await expect(listApplicationsUseCase()).resolves.toEqual([]);
  });
});
