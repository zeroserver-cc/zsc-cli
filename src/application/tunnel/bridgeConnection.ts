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
const DRAIN_POLL_MS = 20;

const NORMAL_CLOSE_CODES = new Set([1000, 1001, 1005]);

/**
 * Bridges one accepted local connection to a fresh tunnel channel. The local socket is
 * paused until the channel is open so early client bytes (Postgres startup) are not lost.
 * Resolves with how the tunnel ended; rejects only when the channel could not be opened.
 */
export async function bridgeConnection(
  local: LocalConnection,
  openChannel: () => Promise<TunnelChannel>,
  idleMs: number = TUNNEL_IDLE_MS
): Promise<TunnelCloseInfo> {
  // Errors surface through 'close'; an unhandled 'error' event would crash the process.
  local.on('error', () => undefined);
  local.pause();

  let channel: TunnelChannel;
  try {
    channel = await openChannel();
  } catch (err) {
    local.destroy();
    throw err;
  }

  return new Promise<TunnelCloseInfo>((resolve) => {
    let drainTimer: NodeJS.Timeout | undefined;
    let settled = false;

    const settle = (info: TunnelCloseInfo): void => {
      if (settled) return;
      settled = true;
      if (drainTimer) clearInterval(drainTimer);
      resolve(info);
    };

    local.on('close', () => {
      channel.close();
      settle({ code: 1000, reason: 'local connection closed' });
    });
    local.setTimeout(idleMs, () => local.destroy());

    channel.onClose((info) => {
      if (NORMAL_CLOSE_CODES.has(info.code)) local.end();
      else local.destroy();
      settle(info);
    });

    channel.onMessage((chunk) => {
      if (local.destroyed) return;
      local.write(chunk);
      if (local.writableLength > MAX_PENDING_LOCAL_WRITE_BYTES) {
        local.destroy(new Error('local client is not reading'));
        channel.close();
      }
    });

    local.on('data', (chunk: Buffer) => {
      channel.send(chunk);
      if (channel.bufferedAmount > SEND_HIGH_WATER_BYTES && !drainTimer) {
        local.pause();
        drainTimer = setInterval(() => {
          if (channel.bufferedAmount > SEND_LOW_WATER_BYTES) return;
          clearInterval(drainTimer);
          drainTimer = undefined;
          if (!local.destroyed) local.resume();
        }, DRAIN_POLL_MS);
      }
    });

    if (local.destroyed) {
      channel.close();
      settle({ code: 1000, reason: 'local connection closed' });
    } else {
      local.resume();
    }
  });
}

export function isTunnelRefusal(info: TunnelCloseInfo): boolean {
  return info.code >= 4000 && info.code < 5000;
}
