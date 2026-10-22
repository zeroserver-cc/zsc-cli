import { TunnelClosedError } from '../../application/tunnel/errors';
import { OpenTunnelChannel, TunnelChannel, TunnelCloseInfo } from '../../application/tunnel/ports';

const OPEN = 1;

/** The slice of the WHATWG WebSocket the tunnel needs; lets tests inject a fake. */
export interface WebSocketLike {
  binaryType: string;
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: WebSocketEventLike) => void): void;
}

interface WebSocketEventLike {
  data?: unknown;
  code?: number;
  reason?: string;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

// Node 22 ships a global WebSocket (undici). It cannot set headers, hence the
// single-use ticket in the query string instead of the JWT.
const defaultFactory: WebSocketFactory = (url) => new WebSocket(url) as unknown as WebSocketLike;

export function ticketUrl(url: string, ticket: string): string {
  const target = new URL(url);
  target.searchParams.set('ticket', ticket);
  return target.toString();
}

function toBytes(data: unknown): Uint8Array | undefined {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return undefined; // text frames are not part of the protocol
}

class WebSocketTunnelChannel implements TunnelChannel {
  constructor(private readonly socket: WebSocketLike) {}

  get bufferedAmount(): number {
    return this.socket.bufferedAmount;
  }

  send(chunk: Uint8Array): void {
    if (this.socket.readyState === OPEN) this.socket.send(chunk);
  }

  close(): void {
    // Closing an already closing/closed socket is a no-op per the spec.
    this.socket.close(1000);
  }

  onMessage(listener: (chunk: Uint8Array) => void): void {
    this.socket.addEventListener('message', (event) => {
      const bytes = toBytes(event.data);
      if (bytes) listener(bytes);
    });
  }

  onClose(listener: (info: TunnelCloseInfo) => void): void {
    this.socket.addEventListener('close', (event) =>
      listener({ code: event.code ?? 1005, reason: event.reason ?? '' })
    );
  }
}

export function createWebSocketTunnelOpener(
  factory: WebSocketFactory = defaultFactory
): OpenTunnelChannel {
  return ({ url, ticket }) =>
    new Promise<TunnelChannel>((resolve, reject) => {
      const socket = factory(ticketUrl(url, ticket));
      socket.binaryType = 'arraybuffer';
      socket.addEventListener('open', () => resolve(new WebSocketTunnelChannel(socket)));
      // Before 'open' a close (or the error preceding it) means the upgrade failed.
      socket.addEventListener('close', (event) =>
        reject(new TunnelClosedError(event.code ?? 1006, event.reason ?? ''))
      );
    });
}
