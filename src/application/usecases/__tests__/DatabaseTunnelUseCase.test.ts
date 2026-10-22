import {
  defaultTunnelPort,
  requestTunnelTicketUseCase,
  startDatabaseTunnelUseCase
} from '../DatabaseTunnelUseCase';
import { gqlRequest, GraphQLError } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import {
  MANAGED_DATABASE_CONNECTION_STRING_QUERY,
  MY_DATABASES_QUERY,
  OPEN_MANAGED_DATABASE_TUNNEL_MUTATION
} from '../../../infrastructure/graphql/queries';

jest.mock('../../../infrastructure/graphql/client', () => ({
  ...jest.requireActual('../../../infrastructure/graphql/client'),
  gqlRequest: jest.fn()
}));
jest.mock('../../../infrastructure/config/store');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

const database = (overrides = {}) => ({
  id: 'db-1',
  name: 'app-db',
  engine: 'POSTGRES',
  status: 'RUNNING',
  replicas: [],
  ...overrides
});

function backend(db = database()) {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_DATABASES_QUERY) return { myDatabases: [db] } as any;
    if (query === MANAGED_DATABASE_CONNECTION_STRING_QUERY) {
      return {
        managedDatabaseConnectionString: 'postgres://app%20user:s3cret@host:5432/app'
      } as any;
    }
    throw new Error(`unexpected query: ${query}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
});

describe('defaultTunnelPort', () => {
  it('uses the standard port of each engine', () => {
    expect(defaultTunnelPort('POSTGRES')).toBe(5432);
    expect(defaultTunnelPort('MYSQL')).toBe(3306);
  });
});

describe('requestTunnelTicketUseCase', () => {
  it('calls the mutation with the database id and the session token', async () => {
    const ticket = { url: 'wss://x', ticket: 't' };
    mockGql.mockResolvedValue({ openManagedDatabaseTunnel: ticket } as any);

    await expect(requestTunnelTicketUseCase('db-1')).resolves.toBe(ticket);
    expect(mockGql).toHaveBeenCalledWith(
      OPEN_MANAGED_DATABASE_TUNNEL_MUTATION,
      { id: 'db-1' },
      'a-token'
    );
  });

  it('explains when the backend does not know the mutation yet', async () => {
    mockGql.mockRejectedValue(
      new GraphQLError('Cannot query field "openManagedDatabaseTunnel" on type "Mutation".')
    );
    await expect(requestTunnelTicketUseCase('db-1')).rejects.toThrow(
      'This backend does not support database tunnels yet.'
    );
  });

  it('fails early without a session', async () => {
    (getConfigValue as jest.Mock).mockReturnValue(undefined);
    await expect(requestTunnelTicketUseCase('db-1')).rejects.toThrow('Not logged in');
  });
});

describe('startDatabaseTunnelUseCase', () => {
  const listener = { port: 5432, close: jest.fn().mockResolvedValue(undefined) };

  it('listens on the engine default port and exposes identity without the password', async () => {
    backend();
    const listen = jest.fn().mockResolvedValue(listener);

    const tunnel = await startDatabaseTunnelUseCase('app-db', undefined, {
      listen,
      openChannel: jest.fn()
    });

    expect(listen).toHaveBeenCalledWith(5432, expect.any(Function));
    expect(tunnel).toEqual(
      expect.objectContaining({ name: 'app-db', port: 5432, username: 'app user', database: 'app' })
    );
    expect(JSON.stringify(tunnel)).not.toContain('s3cret');
  });

  it('honours --port and uses the port the listener actually bound', async () => {
    backend(database({ engine: 'MYSQL' }));
    const listen = jest.fn().mockResolvedValue({ ...listener, port: 15432 });

    const tunnel = await startDatabaseTunnelUseCase('app-db', 15432, {
      listen,
      openChannel: jest.fn()
    });

    expect(listen).toHaveBeenCalledWith(15432, expect.any(Function));
    expect(tunnel.port).toBe(15432);
  });

  it('refuses a database that is not RUNNING before listening', async () => {
    backend(database({ status: 'PENDING' }));
    const listen = jest.fn();

    await expect(
      startDatabaseTunnelUseCase('app-db', undefined, { listen, openChannel: jest.fn() })
    ).rejects.toThrow('is PENDING');
    expect(listen).not.toHaveBeenCalled();
  });

  it('propagates a busy port error from the listener', async () => {
    backend();
    const listen = jest.fn().mockRejectedValue(new Error('Port 5432 is already in use.'));
    await expect(
      startDatabaseTunnelUseCase('app-db', undefined, { listen, openChannel: jest.fn() })
    ).rejects.toThrow('already in use');
  });

  it('requests a fresh ticket for every accepted connection and reports failures', async () => {
    backend();
    let onConnection!: (connection: any) => void;
    const listen = jest.fn().mockImplementation(async (_port, cb) => {
      onConnection = cb;
      return listener;
    });
    const events: unknown[] = [];
    const openChannel = jest.fn().mockRejectedValue(new Error('boom'));
    await startDatabaseTunnelUseCase('app-db', undefined, {
      listen,
      openChannel,
      onEvent: (e) => events.push(e)
    });
    mockGql.mockImplementation(async () => ({ openManagedDatabaseTunnel: { ticket: 't' } }) as any);

    const connection = () => ({ on: jest.fn(), pause: jest.fn(), destroy: jest.fn() });
    onConnection(connection());
    onConnection(connection());
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const ticketCalls = mockGql.mock.calls.filter(
      (c) => c[0] === OPEN_MANAGED_DATABASE_TUNNEL_MUTATION
    );
    expect(ticketCalls).toHaveLength(2);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'connection-failed', error: expect.any(Error) });
  });
});
