import { requireRole } from '../requireRole';
import { getConfigArray, getConfigValue } from '../../../infrastructure/config/store';

jest.mock('../../../infrastructure/config/store', () => ({
  ...jest.requireActual('../../../infrastructure/config/store'),
  getConfigValue: jest.fn(),
  getConfigArray: jest.fn(),
}));

const mockedGetConfigValue = getConfigValue as jest.MockedFunction<typeof getConfigValue>;
const mockedGetConfigArray = getConfigArray as jest.MockedFunction<typeof getConfigArray>;

describe('requireRole', () => {
  let exitSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedGetConfigValue.mockReset();
    mockedGetConfigArray.mockReset();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function mockSession(roles: string[] | undefined, legacyRole?: string): void {
    mockedGetConfigValue.mockImplementation((key) => {
      if (key === 'accessToken') return 'token-a';
      if (key === 'role') return legacyRole;
      return undefined;
    });
    mockedGetConfigArray.mockReturnValue(roles);
  }

  it('exits when there is no session', () => {
    mockSession(undefined, undefined);
    mockedGetConfigValue.mockReturnValue(undefined);

    expect(() => requireRole(['developer', 'admin'])).toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
  });

  it('passes when any stored role matches the allowed list', () => {
    mockSession(['developer', 'provider'], 'developer');

    expect(() => requireRole(['provider', 'admin'])).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits when no stored role matches the allowed list', () => {
    mockSession(['developer'], 'developer');

    expect(() => requireRole(['provider', 'admin'])).toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('This command requires provider or admin role'),
    );
  });

  it('falls back to the legacy scalar role when roles are absent', () => {
    mockSession(undefined, 'provider');

    expect(() => requireRole(['provider', 'admin'])).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('falls back to the legacy scalar role when roles are empty', () => {
    mockSession([], 'developer');

    expect(() => requireRole(['developer', 'admin'])).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('reports the stored roles in the error message', () => {
    mockSession(['developer', 'provider'], 'developer');

    expect(() => requireRole(['admin'])).toThrow('process.exit');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('developer, provider'));
  });
});
