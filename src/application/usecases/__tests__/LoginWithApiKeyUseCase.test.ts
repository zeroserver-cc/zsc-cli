import { loginWithApiKeyUseCase } from '../LoginWithApiKeyUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { setConfigValue, deleteConfigValue } from '../../../infrastructure/config/store';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store', () => ({
  ...jest.requireActual('../../../infrastructure/config/store'),
  setConfigValue: jest.fn(),
  deleteConfigValue: jest.fn(),
}));

const mockedGqlRequest = gqlRequest as jest.MockedFunction<typeof gqlRequest>;
const mockedSetConfigValue = setConfigValue as jest.MockedFunction<typeof setConfigValue>;
const mockedDeleteConfigValue = deleteConfigValue as jest.MockedFunction<typeof deleteConfigValue>;

const API_KEY = `zsk_${'a'.repeat(64)}`;

const me = {
  id: 'u1',
  username: 'ci-bot',
  email: 'ci@zsc.cloud',
  role: 'developer' as const,
  roles: ['developer' as const],
};

afterEach(() => {
  jest.clearAllMocks();
});

describe('loginWithApiKeyUseCase', () => {
  it('validates the key via Me and stores an apikey session without refresh token', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ me });

    const result = await loginWithApiKeyUseCase(API_KEY);

    expect(result.user).toEqual(me);
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('me'), undefined, API_KEY);
    expect(mockedSetConfigValue).toHaveBeenCalledWith('accessToken', API_KEY);
    expect(mockedSetConfigValue).toHaveBeenCalledWith('token', API_KEY);
    expect(mockedSetConfigValue).toHaveBeenCalledWith('authType', 'apikey');
    expect(mockedSetConfigValue).toHaveBeenCalledWith('role', 'developer');
    expect(mockedSetConfigValue).toHaveBeenCalledWith('roles', ['developer']);
    expect(mockedSetConfigValue).not.toHaveBeenCalledWith('refreshToken', expect.anything());
    expect(mockedDeleteConfigValue).toHaveBeenCalledWith('refreshToken');
    expect(mockedDeleteConfigValue).toHaveBeenCalledWith('activeAccountId');
  });

  it('rejects keys without the zsk_ prefix before hitting the backend', async () => {
    await expect(loginWithApiKeyUseCase('not-an-api-key')).rejects.toThrow('zsk_');

    expect(mockedGqlRequest).not.toHaveBeenCalled();
    expect(mockedSetConfigValue).not.toHaveBeenCalled();
  });
});
