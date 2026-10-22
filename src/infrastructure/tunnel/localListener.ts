import net from 'node:net';
import { LocalPortUnavailableError } from '../../application/tunnel/errors';
import { ListenLocal, LocalConnection } from '../../application/tunnel/ports';

const LOOPBACK = '127.0.0.1';

/** Listens on loopback only: the tunnel must never be reachable from the network. */
export const listenLocal: ListenLocal = (port, onConnection) =>
  new Promise((resolve, reject) => {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      socket.setNoDelay(true);
      onConnection(socket as LocalConnection);
    });

    server.once('error', (err: NodeJS.ErrnoException) =>
      reject(new LocalPortUnavailableError(port, err))
    );
    server.listen(port, LOOPBACK, () => {
      server.removeAllListeners('error');
      server.on('error', () => undefined);
      const address = server.address() as net.AddressInfo;
      resolve({
        port: address.port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            for (const socket of sockets) socket.destroy();
          })
      });
    });
  });
