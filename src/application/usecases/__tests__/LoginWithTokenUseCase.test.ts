import { loginWithTokenUseCase } from '../LoginWithTokenUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { setConfigValue, deleteConfigValue, getConfigValue } from '../../../infrastructure/config/store';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store', () => ({
  ...jest.requireActual('../../../infrastructure/config/store'),
  setConfigValue: jest.fn(),
  deleteConfigValue: jest.fn(),
  getConfigValue: jest.fn(),
}));

const mockedGqlRequest = gqlRequest as jest.MockedFunction<typeof gqlRequest>;
const mockedSetConfigValue = setConfigValue as jest.MockedFunction<typeof setConfigValue>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('loginWithTokenUseCase', () => {
  it('validates token via Me query and stores session', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      me: { id: 'u1', username: 'dev', email: 'dev@zsc.cloud', role: 'developer' },
    });

    const result = await loginWithTokenUseCase('access-token-123', 'refresh-token-456');

    expect(result.accessToken).toBe('access-token-123');
    expect(result.refreshToken).toBe('refresh-token-456');
    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('me'),
      undefined,
      'access-token-123',
    );
    expect(mockedSetConfigValue).toHaveBeenCalledWith('accessToken', 'access-token-123');
    expect(mockedSetConfigValue).toHaveBeenCalledWith('token', 'access-token-123');
    expect(mockedSetConfigValue).toHaveBeenCalledWith('refreshToken', 'refresh-token-456');
    expect(mockedSetConfigValue).toHaveBeenCalledWith('role', 'developer');
  });

  it('works without refresh token', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      me: { id: 'u1', username: 'dev', email: 'dev@zsc.cloud', role: 'developer' },
    });

    const result = await loginWithTokenUseCase('access-token-123');

    expect(result.refreshToken).toBeUndefined();
    expect(mockedSetConfigValue).not.toHaveBeenCalledWith('refreshToken', expect.anything());
  });
});
