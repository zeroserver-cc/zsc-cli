import net from 'node:net';
import { LocalPortUnavailableError } from '../../application/tunnel/errors';
import { ListenLocal, LocalConnection } from '../../application/tunnel/ports';

const LOOPBACK_V4 = '127.0.0.1';
const LOOPBACK_V6 = '::1';
const IPV6_UNAVAILABLE = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT']);

function listenOn(server: net.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      server.on('error', () => undefined);
      resolve();
    });
  });
}

const closeServer = (server: net.Server): Promise<void> =>
  new Promise((done) => (server.listening ? server.close(() => done()) : done()));

/**
 * Listens on both loopback addresses, never on the network. Binding ::1 as well matters:
 * another process on [::] / 0.0.0.0 can coexist with a 127.0.0.1-only bind, and then
 * "localhost" would reach that process instead of the tunnel. Only "IPv6 unavailable"
 * is tolerated; any other failure on either address aborts.
 */
export const listenLocal: ListenLocal = async (port, onConnection) => {
  const sockets = new Set<net.Socket>();
  const handler = (socket: net.Socket): void => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.setNoDelay(true);
    onConnection(socket as LocalConnection);
  };

  const v4 = net.createServer(handler);
  try {
    await listenOn(v4, port, LOOPBACK_V4);
  } catch (err) {
    throw new LocalPortUnavailableError(port, err as NodeJS.ErrnoException);
  }
  const boundPort = (v4.address() as net.AddressInfo).port;
  const servers = [v4];

  const v6 = net.createServer(handler);
  try {
    await listenOn(v6, boundPort, LOOPBACK_V6);
    servers.push(v6);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (!IPV6_UNAVAILABLE.has(error.code ?? '')) {
      await closeServer(v4);
      throw new LocalPortUnavailableError(port, error);
    }
  }

  return {
    port: boundPort,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await Promise.all(servers.map(closeServer));
    }
  };
};
