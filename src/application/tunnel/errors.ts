/** The tunnel was refused or dropped by the server (WebSocket close code + reason). */
export class TunnelClosedError extends Error {
  constructor(
    public readonly code: number,
    public readonly reason: string
  ) {
    super(`Tunnel closed (${code}${reason ? `: ${reason}` : ''})`);
    this.name = 'TunnelClosedError';
  }
}

export class LocalPortUnavailableError extends Error {
  constructor(
    public readonly port: number,
    public readonly cause: NodeJS.ErrnoException
  ) {
    super(
      cause.code === 'EADDRINUSE'
        ? `Port ${port} is already in use. Pick another one with --port <n>.`
        : `Could not listen on 127.0.0.1:${port} (${cause.code ?? cause.message}). Pick another port with --port <n>.`
    );
    this.name = 'LocalPortUnavailableError';
  }
}

export class TunnelOpenTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(
      `Timed out after ${Math.round(timeoutMs / 1000)}s opening the tunnel. Check your network and retry.`
    );
    this.name = 'TunnelOpenTimeoutError';
  }
}

export class InsecureTunnelUrlError extends Error {
  constructor(public readonly host: string) {
    super(
      `Refusing to open a tunnel over an insecure URL (host ${host}): the server must provide a wss:// address.`
    );
    this.name = 'InsecureTunnelUrlError';
  }
}
