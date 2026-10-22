import { InsecureTunnelUrlError } from './errors';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The URL comes from the server and carries a bearer-like ticket, so it must be wss://.
 * Plain ws:// is accepted only for loopback hosts (local backend during development).
 */
export function assertSecureTunnelUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('The server returned an invalid tunnel URL.');
  }
  if (url.protocol === 'wss:') return;
  if (url.protocol === 'ws:' && LOOPBACK_HOSTS.has(url.hostname)) return;
  throw new InsecureTunnelUrlError(url.host);
}
