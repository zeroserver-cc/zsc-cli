export interface RegistryLoginOptions {
  registryHost?: string;
  username?: string;
  tokenStdin?: boolean;
}

// Injected input sources, so the resolution logic below stays pure and testable
// without touching the real TTY or process.stdin.
export interface RegistryLoginPrompts {
  promptHost: () => Promise<string>;
  promptUsername: () => Promise<string>;
  promptToken: () => Promise<string>;
  readStdin: () => Promise<string>;
}

export interface RegistryLoginInputs {
  registryHost: string;
  username: string;
  token: string;
}

/**
 * Resolve the three registry-login inputs from flags, an interactive TTY, or
 * stdin.
 *
 * With `--token-stdin` the command is fully non-interactive: the token is read
 * from stdin and the host (positional argument) and `--username` must be
 * provided, so nothing ever blocks on a prompt or leaks into argv / shell
 * history. This is the path CI uses to (re)store the credential on every deploy.
 * Without it the behaviour is unchanged: missing values are prompted for, the
 * token with echo off.
 */
export async function resolveRegistryLogin(
  opts: RegistryLoginOptions,
  io: RegistryLoginPrompts,
): Promise<RegistryLoginInputs> {
  if (opts.tokenStdin) {
    const registryHost = opts.registryHost?.trim();
    const username = opts.username?.trim();
    if (!registryHost) {
      throw new Error('Registry host is required with --token-stdin (pass it as an argument, e.g. "ghcr.io").');
    }
    if (!username) {
      throw new Error('--username is required with --token-stdin.');
    }
    const token = (await io.readStdin()).trim();
    if (!token) {
      throw new Error(
        'No token received on stdin. Pipe it, e.g. `printf %s "$TOKEN" | zs registry login ghcr.io -u user --token-stdin`.',
      );
    }
    return { registryHost, username, token };
  }

  const registryHost = (opts.registryHost ?? (await io.promptHost())).trim();
  const username = (opts.username ?? (await io.promptUsername())).trim();
  const token = (await io.promptToken()).trim();

  if (!registryHost || !username || !token) {
    throw new Error('Registry host, username and token are all required.');
  }
  return { registryHost, username, token };
}
