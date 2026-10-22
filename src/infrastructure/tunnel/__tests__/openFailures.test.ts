import http from 'node:http';
import net from 'node:net';
import { AddressInfo } from 'node:net';
import { TunnelClosedError, TunnelOpenTimeoutError } from '../../../application/tunnel/errors';
import { TunnelTicket } from '../../../application/tunnel/ports';
import { createWebSocketTunnelOpener, WebSocketLike } from '../webSocketTunnelChannel';

const ticketFor = (url: string): TunnelTicket => ({
  url,
  ticket: 't',
  expiresAt: '2026-10-22T00:00:00.000Z',
  engine: 'POSTGRES',
  username: 'u',
  database: 'd'
});

/**
 * These use the REAL global WebSocket. On Node 22 (CI and the pkg binary) a failed
 * handshake fires only 'error', never 'close': the opener used to hang forever there.
 */
describe('opener against the real global WebSocket', () => {
  let server: http.Server;
  let mode: '404' | '403' | 'destroy' = '404';
  let url: string;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end('nope');
    });
    server.on('upgrade', (_req, socket) => {
      if (mode === 'destroy') socket.destroy();
      else socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/x`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it.each(['404', '403', 'destroy'] as const)(
    'rejects instead of hanging when the handshake fails (%s)',
    async (m) => {
      mode = m;
      const open = createWebSocketTunnelOpener(undefined, 5_000);

      const error = await open(ticketFor(url)).catch((e) => e);

      expect(error).toBeInstanceOf(TunnelClosedError);
      expect(error.code).toBe(1006);
      expect(error.reason).toBe(new URL(url).host);
    },
    10_000
  );

  it('rejects when the connection is refused', async () => {
    const free = await new Promise<number>((resolve) => {
      const s = net.createServer().listen(0, '127.0.0.1', () => {
        const { port } = s.address() as AddressInfo;
        s.close(() => resolve(port));
      });
    });
    const open = createWebSocketTunnelOpener(undefined, 5_000);

    await expect(open(ticketFor(`ws://127.0.0.1:${free}/x`))).rejects.toBeInstanceOf(
      TunnelClosedError
    );
  }, 10_000);
});

describe('opener with a socket that never answers', () => {
  it('times out, closes the socket and reports a clear error', async () => {
    const closed = jest.fn();
    const silent: WebSocketLike = {
      binaryType: 'blob',
      readyState: 0,
      bufferedAmount: 0,
      send: jest.fn(),
      close: closed,
      addEventListener: jest.fn()
    };
    const open = createWebSocketTunnelOpener(() => silent, 30);

    const error = await open(ticketFor('wss://db.example/x')).catch((e) => e);

    expect(error).toBeInstanceOf(TunnelOpenTimeoutError);
    expect(error.message).toMatch(/Timed out/);
    expect(closed).toHaveBeenCalled();
  });
});
