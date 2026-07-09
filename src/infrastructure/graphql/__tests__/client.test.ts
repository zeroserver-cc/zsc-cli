import axios from 'axios';
import { gqlRequest, GraphQLError, refreshCurrentSession } from '../client';
import {
  getConfigValue,
  setConfigValue,
  deleteConfigValue,
} from '../../config/store';

jest.mock('axios');
jest.mock('../../config/store', () => ({
  ...jest.requireActual('../../config/store'),
  getConfigValue: jest.fn(),
  setConfigValue: jest.fn(),
  deleteConfigValue: jest.fn(),
  getBackendUrl: jest.fn(() => 'https://api.zeroserver.cc'),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGetConfigValue = getConfigValue as jest.MockedFunction<typeof getConfigValue>;
const mockedSetConfigValue = setConfigValue as jest.MockedFunction<typeof setConfigValue>;
const mockedDeleteConfigValue = deleteConfigValue as jest.MockedFunction<typeof deleteConfigValue>;

describe('gqlRequest', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedGetConfigValue.mockReset();
    mockedSetConfigValue.mockReset();
    mockedDeleteConfigValue.mockReset();
    (mockedAxios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns data on success using stored access token', async () => {
    mockedGetConfigValue.mockImplementation((key) =>
      key === 'accessToken' ? 'token-a' : undefined,
    );
    mockedAxios.post.mockResolvedValueOnce({ data: { data: { me: { id: '1' } } } });

    const result = await gqlRequest('query { me { id } }');

    expect(result).toEqual({ me: { id: '1' } });
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token and retries on auth error', async () => {
    mockedGetConfigValue.mockImplementation((key) => {
      if (key === 'accessToken') return 'token-a';
      if (key === 'refreshToken') return 'refresh-a';
      return undefined;
    });

    mockedAxios.post
      .mockResolvedValueOnce({ data: { errors: [{ message: 'Invalid token' }] } })
      .mockResolvedValueOnce({
        data: {
          data: {
            refreshToken: {
              accessToken: 'token-b',
              refreshToken: 'refresh-b',
              expiresAt: new Date(Date.now() + 3600_000).toISOString(),
              user: { role: 'developer' },
            },
          },
        },
      })
      .mockResolvedValueOnce({ data: { data: { me: { id: '1' } } } });

    const result = await gqlRequest('query { me { id } }');

    expect(result).toEqual({ me: { id: '1' } });
    expect(mockedSetConfigValue).toHaveBeenCalledWith('accessToken', 'token-b');
    expect(mockedSetConfigValue).toHaveBeenCalledWith('refreshToken', 'refresh-b');
    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
  });

  it('retries with the new access token when another request already refreshed it', async () => {
    mockedGetConfigValue.mockImplementation((key) => {
      if (key === 'accessToken') return 'token-b';
      if (key === 'refreshToken') return 'refresh-a';
      return undefined;
    });

    mockedAxios.post
      .mockResolvedValueOnce({ data: { errors: [{ message: 'Invalid token' }] } })
      .mockResolvedValueOnce({ data: { data: { me: { id: '1' } } } });

    const result = await gqlRequest('query { me { id } }', undefined, 'token-a');

    expect(result).toEqual({ me: { id: '1' } });
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedSetConfigValue).not.toHaveBeenCalledWith('accessToken', 'token-b');
  });

  it('clears the session when refresh fails', async () => {
    mockedGetConfigValue.mockImplementation((key) => {
      if (key === 'accessToken') return 'token-a';
      if (key === 'refreshToken') return 'refresh-a';
      return undefined;
    });

    mockedAxios.post
      .mockResolvedValueOnce({ data: { errors: [{ message: 'Invalid token' }] } })
      .mockResolvedValueOnce({ data: { errors: [{ message: 'Invalid refresh token' }] } });

    await expect(gqlRequest('query { me { id } }')).rejects.toThrow(GraphQLError);

    expect(mockedDeleteConfigValue).toHaveBeenCalledWith('accessToken');
    expect(mockedDeleteConfigValue).toHaveBeenCalledWith('refreshToken');
  });
});

describe('refreshCurrentSession', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedGetConfigValue.mockReset();
    mockedSetConfigValue.mockReset();
    mockedDeleteConfigValue.mockReset();
  });

  it('returns null when there is no refresh token', async () => {
    mockedGetConfigValue.mockReturnValue(undefined);
    const result = await refreshCurrentSession();
    expect(result).toBeNull();
  });

  it('refreshes and stores the new session', async () => {
    mockedGetConfigValue.mockImplementation((key) =>
      key === 'refreshToken' ? 'refresh-a' : undefined,
    );
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          refreshToken: {
            accessToken: 'token-b',
            refreshToken: 'refresh-b',
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            user: { role: 'developer' },
          },
        },
      },
    });

    const result = await refreshCurrentSession();

    expect(result).toBe('token-b');
    expect(mockedSetConfigValue).toHaveBeenCalledWith('accessToken', 'token-b');
    expect(mockedSetConfigValue).toHaveBeenCalledWith('refreshToken', 'refresh-b');
  });
});
