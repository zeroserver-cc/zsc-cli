import type { Duplex } from 'node:stream';

/** One raw TCP stream carried over a WebSocket: bytes up, bytes down. */
export interface TunnelChannel {
  readonly bufferedAmount: number;
  send(chunk: Uint8Array): void;
  close(): void;
  onMessage(listener: (chunk: Uint8Array) => void): void;
  onClose(listener: (info: TunnelCloseInfo) => void): void;
}

export interface TunnelCloseInfo {
  code: number;
  reason: string;
}

/** Local side of a bridged connection (a TCP socket in production). */
export type LocalConnection = Duplex & {
  setTimeout(timeout: number, callback?: () => void): unknown;
};

export interface TunnelTicket {
  url: string;
  ticket: string;
  expiresAt: string;
  engine: 'POSTGRES' | 'MYSQL';
  username: string;
  database: string;
}

export interface TunnelListener {
  readonly port: number;
  close(): Promise<void>;
}

export type ListenLocal = (
  port: number,
  onConnection: (connection: LocalConnection) => void
) => Promise<TunnelListener>;

export type OpenTunnelChannel = (ticket: TunnelTicket) => Promise<TunnelChannel>;
