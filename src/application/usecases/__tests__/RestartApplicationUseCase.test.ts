import { restartApplicationUseCase } from '../RestartApplicationUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import { RESTART_APPLICATION_MUTATION } from '../../../infrastructure/graphql/queries';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
});

it('sends the restart mutation with the instance id and returns the instance', async () => {
  mockGql.mockResolvedValue({ restartApplication: { id: 'inst-1', status: 'RUNNING' } } as any);

  const result = await restartApplicationUseCase('inst-1');

  expect(mockGql).toHaveBeenCalledWith(RESTART_APPLICATION_MUTATION, { instanceId: 'inst-1' }, 'a-token');
  expect(result).toEqual({ id: 'inst-1', status: 'RUNNING' });
});

it('fails early when there is no session token', async () => {
  (getConfigValue as jest.Mock).mockReturnValue(undefined);

  await expect(restartApplicationUseCase('inst-1')).rejects.toThrow('Not logged in. Run "zs login" first.');
  expect(mockGql).not.toHaveBeenCalled();
});
