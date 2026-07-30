import {
  InvalidTwoFactorCodeError,
  loginUseCase,
  TwoFactorRequiredError,
} from '../LoginUseCase';
import { gqlRequest, GraphQLError } from '../../../infrastructure/graphql/client';
import { deleteConfigValue } from '../../../infrastructure/config/store';
import { AuthPayload } from '../../../domain/entities/types';

jest.mock('../../../infrastructure/graphql/client', () => ({
  ...jest.requireActual('../../../infrastructure/graphql/client'),
  gqlRequest: jest.fn(),
}));
jest.mock('../../../infrastructure/config/store', () => ({
  ...jest.requireActual('../../../infrastructure/config/store'),
  setConfigValue: jest.fn(),
  deleteConfigValue: jest.fn(),
}));

const mockedGqlRequest = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

const payload: AuthPayload = {
  token: 'token-a',
  accessToken: 'token-a',
  refreshToken: 'refresh-a',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  user: { id: 'u1', username: 'dev', email: 'dev@zsc.cloud', role: 'developer', roles: ['developer'] },
};

afterEach(() => {
  jest.clearAllMocks();
});

describe('loginUseCase with 2FA', () => {
  it('logs in without a totpCode when the account has no 2FA', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ login: payload });

    const result = await loginUseCase('dev@zsc.cloud', 'secret');

    expect(result).toEqual(payload);
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.anything(), {
      input: { email: 'dev@zsc.cloud', password: 'secret' },
    });
    // Fresh sessions always start acting as the own account.
    expect(deleteConfigValue).toHaveBeenCalledWith('activeAccountId');
  });

  it('passes the totpCode inside the login input when provided', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ login: payload });

    await loginUseCase('dev@zsc.cloud', 'secret', '123456');

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.anything(), {
      input: { email: 'dev@zsc.cloud', password: 'secret', totpCode: '123456' },
    });
  });

  it('passes a recovery code through as totpCode verbatim', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ login: payload });

    await loginUseCase('dev@zsc.cloud', 'secret', 'abcd-efgh');

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.anything(), {
      input: { email: 'dev@zsc.cloud', password: 'secret', totpCode: 'abcd-efgh' },
    });
  });

  it('throws TwoFactorRequiredError when the backend asks for a code', async () => {
    mockedGqlRequest.mockRejectedValueOnce(
      new GraphQLError('2FA code required', [{ message: '2FA code required' }]),
    );

    await expect(loginUseCase('dev@zsc.cloud', 'secret')).rejects.toBeInstanceOf(
      TwoFactorRequiredError,
    );
  });

  it('throws InvalidTwoFactorCodeError when the backend rejects the code', async () => {
    mockedGqlRequest.mockRejectedValueOnce(
      new GraphQLError('Invalid 2FA code', [{ message: 'Invalid 2FA code' }]),
    );

    await expect(loginUseCase('dev@zsc.cloud', 'secret', '000000')).rejects.toBeInstanceOf(
      InvalidTwoFactorCodeError,
    );
  });

  it('rethrows unrelated GraphQL errors untouched', async () => {
    const error = new GraphQLError('Invalid credentials', [{ message: 'Invalid credentials' }]);
    mockedGqlRequest.mockRejectedValueOnce(error);

    await expect(loginUseCase('dev@zsc.cloud', 'wrong')).rejects.toBe(error);
  });
});
