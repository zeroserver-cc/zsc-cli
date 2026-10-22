import net from 'node:net';
import { bridgeConnection } from '../../../application/tunnel/bridgeConnection';
import { TunnelClosedError } from '../../../application/tunnel/errors';
import { TunnelTicket } from '../../../application/tunnel/ports';
import { listenLocal } from '../localListener';
import { createWebSocketTunnelOpener, ticketUrl, WebSocketLike } from '../webSocketTunnelChannel';

type Listener = (event: any) => void;

/** Fake server-side WebSocket: echoes every client frame back, uppercased, as a binary frame. */
class FakeWebSocket implements WebSocketLike {
  binaryType = 'blob';
  readyState = 0;
  bufferedAmount = 0;
  sent: Uint8Array[] = [];
  closedWith?: number;
  private listeners: Record<string, Listener[]> = {};

  constructor(
    readonly url: string,
    private readonly behaviour: 'echo' | 'refuse' = 'echo'
  ) {
    setImmediate(() => {
      if (behaviour === 'refuse') {
        this.readyState = 3;
        this.emit('close', { code: 4401, reason: 'bad ticket' });
      } else {
        this.readyState = 1;
        this.emit('open', {});
      }
    });
  }

  addEventListener(type: string, listener: Listener): void {
    (this.listeners[type] ??= []).push(listener);
  }

  send(data: Uint8Array): void {
    this.sent.push(data);
    const upper = Buffer.from(Buffer.from(data).toString().toUpperCase());
    const frame = upper.buffer.slice(upper.byteOffset, upper.byteOffset + upper.byteLength);
    setImmediate(() => this.emit('message', { data: frame }));
  }

  close(code = 1000): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closedWith = code;
    setImmediate(() => this.emit('close', { code, reason: '' }));
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
}

const ticket: TunnelTicket = {
  url: 'wss://db.zeroserver.cc/api/v1/db-tunnel/db-1',
  ticket: 'tkt 1',
  expiresAt: '2026-10-22T00:00:00.000Z',
  engine: 'POSTGRES',
  username: 'u',
  database: 'app'
};

function connect(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => resolve(socket));
    socket.once('error', reject);
  });
}

function readAll(socket: net.Socket): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    socket.on('data', (c) => chunks.push(c));
    socket.on('close', () => resolve(Buffer.concat(chunks).toString()));
  });
}

describe('ticketUrl', () => {
  it('puts the ticket in the query string, encoded, keeping the path', () => {
    expect(ticketUrl(ticket.url, ticket.ticket)).toBe(
      'wss://db.zeroserver.cc/api/v1/db-tunnel/db-1?ticket=tkt+1'
    );
  });
});

describe('local TCP <-> WebSocket bridge', () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  async function startBridge(factory: (url: string) => FakeWebSocket, idleMs?: number) {
    const opener = createWebSocketTunnelOpener(factory);
    const outcomes: Promise<unknown>[] = [];
    const listener = await listenLocal(0, (connection) => {
      outcomes.push(
        bridgeConnection(connection, () => opener(ticket), { idleMs }).catch((err) => err)
      );
    });
    closers.push(() => listener.close());
    return { port: listener.port, outcomes };
  }

  it('round-trips bytes in both directions over binary frames', async () => {
    const sockets: FakeWebSocket[] = [];
    const { port, outcomes } = await startBridge((url) => {
      const ws = new FakeWebSocket(url);
      sockets.push(ws);
      return ws;
    });

    const client = await connect(port);
    const received = readAll(client);
    client.write('select ');
    client.write('1');
    await new Promise((r) => setTimeout(r, 50));
    client.end();

    expect(await received).toBe('SELECT 1');
    expect(sockets[0].binaryType).toBe('arraybuffer');
    expect(sockets[0].url).toBe('wss://db.zeroserver.cc/api/v1/db-tunnel/db-1?ticket=tkt+1');
    expect(sockets[0].closedWith).toBe(1000);
    await expect(outcomes[0]).resolves.toEqual(
      expect.objectContaining({ code: expect.any(Number) })
    );
  });

  it('opens a separate WebSocket per local connection', async () => {
    const sockets: FakeWebSocket[] = [];
    const { port } = await startBridge((url) => {
      const ws = new FakeWebSocket(url);
      sockets.push(ws);
      return ws;
    });

    const a = await connect(port);
    const b = await connect(port);
    a.write('a');
    b.write('b');
    await new Promise((r) => setTimeout(r, 50));

    expect(sockets).toHaveLength(2);
    a.destroy();
    b.destroy();
  });

  it('drops early client bytes only after the channel opens, without losing them', async () => {
    const { port } = await startBridge((url) => new FakeWebSocket(url));
    const client = await connect(port);
    const received = readAll(client);
    client.write('early');
    await new Promise((r) => setTimeout(r, 50));
    client.end();
    expect(await received).toBe('EARLY');
  });

  it('closes the local socket when the server refuses the ticket and reports the code', async () => {
    const { port, outcomes } = await startBridge((url) => new FakeWebSocket(url, 'refuse'));

    const client = await connect(port);
    const received = readAll(client);

    expect(await received).toBe('');
    const outcome = (await outcomes[0]) as TunnelClosedError;
    expect(outcome).toBeInstanceOf(TunnelClosedError);
    expect(outcome.code).toBe(4401);
  });

  it('closes the local socket after the idle timeout', async () => {
    const { port } = await startBridge((url) => new FakeWebSocket(url), 50);
    const client = await connect(port);
    const received = readAll(client);
    await expect(received).resolves.toBe('');
  });

  it('closes the WebSocket when the local client disconnects abruptly', async () => {
    const sockets: FakeWebSocket[] = [];
    const { port } = await startBridge((url) => {
      const ws = new FakeWebSocket(url);
      sockets.push(ws);
      return ws;
    });
    const client = await connect(port);
    client.write('x');
    await new Promise((r) => setTimeout(r, 30));
    client.destroy();
    await new Promise((r) => setTimeout(r, 30));
    expect(sockets[0].closedWith).toBe(1000);
  });

  it('pauses the local socket while the WebSocket send buffer is above the high-water mark', async () => {
    const sockets: FakeWebSocket[] = [];
    const { port } = await startBridge((url) => {
      const ws = new FakeWebSocket(url);
      ws.bufferedAmount = 5 * 1024 * 1024;
      sockets.push(ws);
      return ws;
    });
    const client = await connect(port);
    client.write('first');
    await new Promise((r) => setTimeout(r, 50));
    client.write('second');
    await new Promise((r) => setTimeout(r, 80));
    expect(sockets[0].sent.map((b) => Buffer.from(b).toString())).toEqual(['first']);

    sockets[0].bufferedAmount = 0;
    await new Promise((r) => setTimeout(r, 80));
    expect(sockets[0].sent.map((b) => Buffer.from(b).toString())).toEqual(['first', 'second']);
    client.destroy();
  });
});

describe('listenLocal', () => {
  it('fails with a clear error when the port is busy, without falling back', async () => {
    const first = await listenLocal(0, () => undefined);
    try {
      await expect(listenLocal(first.port, () => undefined)).rejects.toThrow(
        `Port ${first.port} is already in use. Pick another one with --port <n>.`
      );
    } finally {
      await first.close();
    }
  });
});
