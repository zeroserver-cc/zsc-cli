import chalk from 'chalk';
import { TunnelClosedError } from '../../application/tunnel/errors';
import { isTunnelRefusal } from '../../application/tunnel/bridgeConnection';
import {
  RunningDatabaseTunnel,
  TunnelEvent
} from '../../application/usecases/DatabaseTunnelUseCase';

const REFUSAL_MESSAGES: Record<number, string> = {
  4401: 'The tunnel ticket was rejected or expired. Try connecting again.',
  4403: 'Only the owner of the database can open a tunnel.',
  4429:
    'Too many tunnels are open for your account (each client connection is one tunnel). ' +
    'A connection pool larger than the per-account cap hits this: lower its maximum size or close idle connections. ' +
    'New connections are refused locally for a few seconds.',
  4504: 'The database is unreachable right now. Check "zs db list" and retry.'
};

export function describeTunnelClose(code: number, reason: string): string {
  const known = REFUSAL_MESSAGES[code];
  if (known) return known;
  if (code === 1006)
    return `Could not reach the tunnel endpoint${reason ? ` (${reason})` : ''}. Check your network.`;
  return `The tunnel was closed by the server (${code}${reason ? `: ${reason}` : ''}).`;
}

/** Stateful so the connection identity is printed once, on the first successful connection. */
export function createTunnelReporter(): (event: TunnelEvent) => void {
  let identityPrinted = false;
  return (event) => {
    switch (event.type) {
      case 'connection-opened':
        if (!identityPrinted) {
          identityPrinted = true;
          console.log(chalk.gray(`  database: ${event.database}, username: ${event.username}`));
        }
        break;
      case 'connection-limit':
        console.error(chalk.red('Tunnel connection refused:'), describeTunnelClose(4429, ''));
        break;
      case 'connection-failed': {
        const error = event.error;
        const message =
          error instanceof TunnelClosedError
            ? describeTunnelClose(error.code, error.reason)
            : error instanceof Error
              ? error.message
              : String(error);
        console.error(chalk.red('Tunnel connection failed:'), message);
        break;
      }
      case 'connection-closed':
        if (isTunnelRefusal(event.info)) {
          console.error(
            chalk.red('Tunnel connection refused:'),
            describeTunnelClose(event.info.code, event.info.reason)
          );
        }
        break;
    }
  };
}

/** Never prints the password; credentials stay behind "zs db connection". */
export function printTunnelHint(tunnel: RunningDatabaseTunnel): void {
  console.log(
    `Tunnel to ${chalk.bold(tunnel.name)} open on ${chalk.bold(`127.0.0.1:${tunnel.port}`)}. Press Ctrl+C to close.`
  );
  console.log('  host:     127.0.0.1');
  console.log(`  port:     ${tunnel.port}`);
  console.log(chalk.gray('  database and username: shown when the first client connects'));
  console.log(chalk.gray(`  password: run "zs db connection ${tunnel.name}"`));
}

/** Resolves on the first SIGINT/SIGTERM so the caller can close the listener cleanly. */
export function waitForInterrupt(): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      process.off('SIGINT', done);
      process.off('SIGTERM', done);
      resolve();
    };
    process.once('SIGINT', done);
    process.once('SIGTERM', done);
  });
}
