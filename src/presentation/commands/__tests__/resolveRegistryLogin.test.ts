import { resolveRegistryLogin, RegistryLoginPrompts } from '../resolveRegistryLogin';

function makePrompts(overrides: Partial<RegistryLoginPrompts> = {}): jest.Mocked<RegistryLoginPrompts> {
  return {
    promptHost: jest.fn(async () => 'prompted-host'),
    promptUsername: jest.fn(async () => 'prompted-user'),
    promptToken: jest.fn(async () => 'prompted-token'),
    readStdin: jest.fn(async () => 'stdin-token\n'),
    ...overrides,
  } as jest.Mocked<RegistryLoginPrompts>;
}

describe('resolveRegistryLogin', () => {
  describe('--token-stdin (non-interactive)', () => {
    it('reads the token from stdin and never prompts', async () => {
      const io = makePrompts();

      const inputs = await resolveRegistryLogin(
        { registryHost: 'ghcr.io', username: 'ci', tokenStdin: true },
        io,
      );

      expect(inputs).toEqual({ registryHost: 'ghcr.io', username: 'ci', token: 'stdin-token' });
      expect(io.readStdin).toHaveBeenCalledTimes(1);
      expect(io.promptHost).not.toHaveBeenCalled();
      expect(io.promptUsername).not.toHaveBeenCalled();
      expect(io.promptToken).not.toHaveBeenCalled();
    });

    it('trims surrounding whitespace/newlines from the piped token', async () => {
      const io = makePrompts({ readStdin: jest.fn(async () => '  tok-123\n') });

      const inputs = await resolveRegistryLogin(
        { registryHost: 'ghcr.io', username: 'ci', tokenStdin: true },
        io,
      );

      expect(inputs.token).toBe('tok-123');
    });

    it('throws when the registry host is missing', async () => {
      const io = makePrompts();

      await expect(
        resolveRegistryLogin({ username: 'ci', tokenStdin: true }, io),
      ).rejects.toThrow(/Registry host is required/);
      expect(io.readStdin).not.toHaveBeenCalled();
    });

    it('throws when the username is missing', async () => {
      const io = makePrompts();

      await expect(
        resolveRegistryLogin({ registryHost: 'ghcr.io', tokenStdin: true }, io),
      ).rejects.toThrow(/--username is required/);
    });

    it('throws when stdin yields an empty token', async () => {
      const io = makePrompts({ readStdin: jest.fn(async () => '   \n') });

      await expect(
        resolveRegistryLogin({ registryHost: 'ghcr.io', username: 'ci', tokenStdin: true }, io),
      ).rejects.toThrow(/No token received on stdin/);
    });
  });

  describe('interactive', () => {
    it('prompts for host, username and token when no flags are given', async () => {
      const io = makePrompts();

      const inputs = await resolveRegistryLogin({}, io);

      expect(inputs).toEqual({
        registryHost: 'prompted-host',
        username: 'prompted-user',
        token: 'prompted-token',
      });
      expect(io.readStdin).not.toHaveBeenCalled();
    });

    it('uses provided flags and only prompts for the token', async () => {
      const io = makePrompts();

      const inputs = await resolveRegistryLogin({ registryHost: 'ghcr.io', username: 'alice' }, io);

      expect(inputs).toEqual({ registryHost: 'ghcr.io', username: 'alice', token: 'prompted-token' });
      expect(io.promptHost).not.toHaveBeenCalled();
      expect(io.promptUsername).not.toHaveBeenCalled();
      expect(io.promptToken).toHaveBeenCalledTimes(1);
    });

    it('throws when the prompted token is empty', async () => {
      const io = makePrompts({ promptToken: jest.fn(async () => '   ') });

      await expect(resolveRegistryLogin({ registryHost: 'ghcr.io', username: 'alice' }, io)).rejects.toThrow(
        /all required/,
      );
    });
  });
});
