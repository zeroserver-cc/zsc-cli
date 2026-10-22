import { ManagedDatabaseEngine } from '../../domain/entities/types';
import { getConfigValue } from '../../infrastructure/config/store';
import { GraphQLError, gqlRequest } from '../../infrastructure/graphql/client';
import {
  MANAGED_DATABASE_CONNECTION_STRING_QUERY,
  OPEN_MANAGED_DATABASE_TUNNEL_MUTATION
} from '../../infrastructure/graphql/queries';
import { bridgeConnection } from '../tunnel/bridgeConnection';
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

export type TunnelEvent =
  | { type: 'connection-closed'; info: TunnelCloseInfo }
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
  username: string;
  database: string;
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
    return data.openManagedDatabaseTunnel;
  } catch (err) {
    if (err instanceof GraphQLError && /Cannot query field/i.test(err.message)) {
      throw new Error('This backend does not support database tunnels yet.');
    }
    throw err;
  }
}

/** Username and database name for the connection hint; the password is never read out of the URL. */
async function readConnectionIdentity(
  databaseId: string
): Promise<{ username: string; database: string }> {
  const token = getConfigValue('accessToken');
  const data = await gqlRequest<{ managedDatabaseConnectionString: string }>(
    MANAGED_DATABASE_CONNECTION_STRING_QUERY,
    { id: databaseId },
    token
  );
  const url = new URL(data.managedDatabaseConnectionString);
  return {
    username: decodeURIComponent(url.username),
    database: decodeURIComponent(url.pathname.replace(/^\//, ''))
  };
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
  const identity = await readConnectionIdentity(database.id);

  const handle = async (connection: LocalConnection): Promise<void> => {
    try {
      const info = await bridgeConnection(connection, async () =>
        deps.openChannel(await requestTunnelTicketUseCase(database.id))
      );
      deps.onEvent?.({ type: 'connection-closed', info });
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
    ...identity,
    close: () => listener.close()
  };
}
