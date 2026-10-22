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
  4429: 'Too many tunnels are open. Close an existing client connection and retry.',
  4504: 'The database is unreachable right now. Check "zs db list" and retry.'
};

export function describeTunnelClose(code: number, reason: string): string {
  const known = REFUSAL_MESSAGES[code];
  if (known) return known;
  if (code === 1006)
    return 'Could not reach the tunnel endpoint (db.zeroserver.cc). Check your network.';
  return `The tunnel was closed by the server (${code}${reason ? `: ${reason}` : ''}).`;
}

export function reportTunnelEvent(event: TunnelEvent): void {
  if (event.type === 'connection-failed') {
    const message =
      event.error instanceof TunnelClosedError
        ? describeTunnelClose(event.error.code, event.error.reason)
        : event.error instanceof Error
          ? event.error.message
          : String(event.error);
    console.error(chalk.red('Tunnel connection failed:'), message);
  } else if (isTunnelRefusal(event.info)) {
    console.error(
      chalk.red('Tunnel connection refused:'),
      describeTunnelClose(event.info.code, event.info.reason)
    );
  }
}

/** Never prints the password; credentials stay behind "zs db connection". */
export function printTunnelHint(tunnel: RunningDatabaseTunnel): void {
  console.log(
    `Tunnel to ${chalk.bold(tunnel.name)} open on ${chalk.bold(`127.0.0.1:${tunnel.port}`)}. Press Ctrl+C to close.`
  );
  console.log(`  host:     127.0.0.1`);
  console.log(`  port:     ${tunnel.port}`);
  console.log(`  database: ${tunnel.database}`);
  console.log(`  username: ${tunnel.username}`);
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
