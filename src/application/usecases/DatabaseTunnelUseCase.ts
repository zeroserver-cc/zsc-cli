import { ManagedDatabaseEngine } from '../../domain/entities/types';
import { getConfigValue } from '../../infrastructure/config/store';
import { GraphQLError, gqlRequest } from '../../infrastructure/graphql/client';
import { OPEN_MANAGED_DATABASE_TUNNEL_MUTATION } from '../../infrastructure/graphql/queries';
import { bridgeConnection } from '../tunnel/bridgeConnection';
import { assertSecureTunnelUrl } from '../tunnel/tunnelUrl';
import {
  ListenLocal,
  LocalConnection,
  OpenTunnelChannel,
  TunnelCloseInfo,
  TunnelListener,
  TunnelTicket
} from '../tunnel/ports';
import { resolveDatabaseUseCase } from './ManagedDatabaseUseCase';

const DEFAULT_PORTS: Record<ManagedDatabaseEngine, number> = { POSTGRES: 5432, MYSQL: 3306 };

export function defaultTunnelPort(engine: ManagedDatabaseEngine): number {
  return DEFAULT_PORTS[engine];
}

/** The per-account tunnel cap, as signalled by the server when it closes a socket. */
export const TUNNEL_LIMIT_CLOSE_CODE = 4429;
/** After the cap is hit, new local connections are refused locally for this long. */
export const TUNNEL_LIMIT_COOLDOWN_MS = 5_000;

export type TunnelEvent =
  | { type: 'connection-opened'; username: string; database: string }
  | { type: 'connection-closed'; info: TunnelCloseInfo }
  | { type: 'connection-limit' }
  | { type: 'connection-failed'; error: unknown };

export interface DatabaseTunnelDeps {
  listen: ListenLocal;
  openChannel: OpenTunnelChannel;
  onEvent?: (event: TunnelEvent) => void;
}

export interface RunningDatabaseTunnel {
  engine: ManagedDatabaseEngine;
  name: string;
  port: number;
  close(): Promise<void>;
}

export async function requestTunnelTicketUseCase(databaseId: string): Promise<TunnelTicket> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');
  try {
    const data = await gqlRequest<{ openManagedDatabaseTunnel: TunnelTicket }>(
      OPEN_MANAGED_DATABASE_TUNNEL_MUTATION,
      { id: databaseId },
      token
    );
    assertSecureTunnelUrl(data.openManagedDatabaseTunnel.url);
    return data.openManagedDatabaseTunnel;
  } catch (err) {
    if (err instanceof GraphQLError && /Cannot query field/i.test(err.message)) {
      throw new Error('This backend does not support database tunnels yet.');
    }
    throw err;
  }
}

/**
 * Starts a loopback listener for a managed database. Every accepted connection gets its
 * own single-use ticket and its own WebSocket, so concurrent clients are independent.
 */
export async function startDatabaseTunnelUseCase(
  nameOrId: string,
  requestedPort: number | undefined,
  deps: DatabaseTunnelDeps
): Promise<RunningDatabaseTunnel> {
  const database = await resolveDatabaseUseCase(nameOrId);
  if (database.status !== 'RUNNING') {
    throw new Error(
      `Database ${database.name} is ${database.status}; a tunnel needs it RUNNING (see "zs db list").`
    );
  }
  let limitReachedUntil = 0;

  const handle = async (connection: LocalConnection): Promise<void> => {
    // A pool bigger than the cap would otherwise burn one GraphQL call per refused connection.
    if (Date.now() < limitReachedUntil) {
      connection.destroy();
      return;
    }
    try {
      const info = await bridgeConnection(connection, async () => {
        const ticket = await requestTunnelTicketUseCase(database.id);
        const channel = await deps.openChannel(ticket);
        deps.onEvent?.({
          type: 'connection-opened',
          username: ticket.username,
          database: ticket.database
        });
        return channel;
      });
      if (info.code === TUNNEL_LIMIT_CLOSE_CODE) {
        if (Date.now() >= limitReachedUntil) deps.onEvent?.({ type: 'connection-limit' });
        limitReachedUntil = Date.now() + TUNNEL_LIMIT_COOLDOWN_MS;
      } else {
        deps.onEvent?.({ type: 'connection-closed', info });
      }
    } catch (error) {
      deps.onEvent?.({ type: 'connection-failed', error });
    }
  };

  const listener: TunnelListener = await deps.listen(
    requestedPort ?? defaultTunnelPort(database.engine),
    (connection) => void handle(connection)
  );

  return {
    engine: database.engine,
    name: database.name,
    port: listener.port,
    close: () => listener.close()
  };
}
