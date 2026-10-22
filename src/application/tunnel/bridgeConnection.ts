import { LocalConnection, TunnelChannel, TunnelCloseInfo } from './ports';

/** Matches the backend idle timeout; a DB session that quiet is considered abandoned. */
export const TUNNEL_IDLE_MS = 15 * 60 * 1000;
/** Stop reading the local socket while this many bytes wait to leave through the WebSocket. */
export const SEND_HIGH_WATER_BYTES = 1024 * 1024;
export const SEND_LOW_WATER_BYTES = 256 * 1024;
/**
 * The WebSocket client has no pause(), so downstream bytes cannot be throttled at the
 * source. If the local client stops reading, give up instead of buffering without bound.
 */
export const MAX_PENDING_LOCAL_WRITE_BYTES = 64 * 1024 * 1024;
/**
 * The backend attaches the relay sidecar on the first ticket of a window, so the first
 * dial can fail with 4504 before the database is reachable. Only that code is retried.
 */
export const UNREACHABLE_CLOSE_CODE = 4504;
export const MAX_UNREACHABLE_RETRIES = 3;
export const UNREACHABLE_RETRY_DELAY_MS = 2_000;
/** Client bytes kept for replay on a retry; a longer first flight is never replayed. */
const MAX_REPLAY_BYTES = 64 * 1024;
const DRAIN_POLL_MS = 20;

const NORMAL_CLOSE_CODES = new Set([1000, 1001, 1005]);
const LOCAL_CLOSED: TunnelCloseInfo = { code: 1000, reason: 'local connection closed' };

export interface BridgeOptions {
  idleMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Bridges one accepted local connection to a tunnel channel. The local socket stays paused
 * while a channel is being opened (and while retrying) so early client bytes are not lost.
 * Resolves with how the tunnel ended; rejects only when a channel could not be opened.
 *
 * A 4504 close on a connection whose server never sent a byte is retried with a fresh
 * channel; the client bytes sent so far are replayed, which is safe because the backend
 * never reached the database. Any other code, or any byte from the server, ends it.
 */
export async function bridgeConnection(
  local: LocalConnection,
  openChannel: () => Promise<TunnelChannel>,
  options: BridgeOptions = {}
): Promise<TunnelCloseInfo> {
  const idleMs = options.idleMs ?? TUNNEL_IDLE_MS;
  const maxRetries = options.maxRetries ?? MAX_UNREACHABLE_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? UNREACHABLE_RETRY_DELAY_MS;

  // Errors surface through 'close'; an unhandled 'error' event would crash the process.
  local.on('error', () => undefined);
  local.pause();

  let localClosed = false;
  let current: TunnelChannel | undefined;
  let serverSpoke = false;
  let replay: Buffer[] | undefined = [];
  let replayBytes = 0;
  let drainTimer: NodeJS.Timeout | undefined;
  let onLocalClosed: (() => void) | undefined;

  local.on('close', () => {
    localClosed = true;
    if (drainTimer) clearInterval(drainTimer);
    current?.close();
    onLocalClosed?.();
  });
  local.setTimeout(idleMs, () => local.destroy());

  local.on('data', (chunk: Buffer) => {
    if (!serverSpoke && replay) {
      replayBytes += chunk.length;
      if (replayBytes > MAX_REPLAY_BYTES) replay = undefined;
      else replay.push(chunk);
    }
    if (!current) return;
    current.send(chunk);
    if (current.bufferedAmount > SEND_HIGH_WATER_BYTES && !drainTimer) {
      local.pause();
      const channel = current;
      drainTimer = setInterval(() => {
        if (channel.bufferedAmount > SEND_LOW_WATER_BYTES) return;
        clearInterval(drainTimer);
        drainTimer = undefined;
        if (!local.destroyed) local.resume();
      }, DRAIN_POLL_MS);
    }
  });

  /** Waits for the retry delay, or returns early when the local client goes away. */
  const pauseBeforeRetry = (): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(done, retryDelayMs);
      onLocalClosed = done;
      function done(): void {
        clearTimeout(timer);
        onLocalClosed = undefined;
        resolve();
      }
    });

  for (let attempt = 0; ; attempt++) {
    let channel: TunnelChannel;
    try {
      channel = await openChannel();
    } catch (err) {
      local.destroy();
      throw err;
    }
    if (localClosed) {
      channel.close();
      return LOCAL_CLOSED;
    }

    const info = await runChannel(channel);
    const retryable =
      info.code === UNREACHABLE_CLOSE_CODE &&
      !serverSpoke &&
      replay !== undefined &&
      attempt < maxRetries &&
      !localClosed;
    if (!retryable) {
      if (info !== LOCAL_CLOSED) {
        if (NORMAL_CLOSE_CODES.has(info.code)) local.end();
        else local.destroy();
      }
      return info;
    }
    local.pause();
    await pauseBeforeRetry();
    if (localClosed) return LOCAL_CLOSED;
  }

  function runChannel(channel: TunnelChannel): Promise<TunnelCloseInfo> {
    return new Promise((resolve) => {
      current = channel;
      channel.onClose((info) => {
        current = undefined;
        resolve(localClosed ? LOCAL_CLOSED : info);
      });
      channel.onMessage((chunk) => {
        serverSpoke = true;
        replay = undefined;
        if (local.destroyed) return;
        local.write(chunk);
        if (local.writableLength > MAX_PENDING_LOCAL_WRITE_BYTES) {
          local.destroy(new Error('local client is not reading'));
          channel.close();
        }
      });
      for (const chunk of replay ?? []) channel.send(chunk);
      if (localClosed) {
        channel.close();
        resolve(LOCAL_CLOSED);
      } else {
        local.resume();
      }
    });
  }
}

export function isTunnelRefusal(info: TunnelCloseInfo): boolean {
  return info.code >= 4000 && info.code < 5000;
}
