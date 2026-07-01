import axios from 'axios';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { chmod, rename, rm } from 'fs/promises';
import { dirname, join } from 'path';
import { pipeline } from 'stream/promises';
import { isNewerVersion } from './versionCompare';

export type SelfUpdateReason =
  | 'updated'
  | 'up-to-date'
  | 'unsupported-arch'
  | 'permission'
  | 'rate-limited'
  | 'error';

export interface SelfUpdateResult {
  updated: boolean;
  fromVersion: string;
  toVersion?: string;
  reason: SelfUpdateReason;
}

const REPO = 'zeroserver-cc/zsc-cli';
const BIN_NAME = 'zs';

/** Mirrors install.sh's OS/arch cases. Returns null for a target with no built binary. */
function assetName(): string | null {
  const plat = process.platform === 'linux' ? 'linux' : process.platform === 'darwin' ? 'macos' : null;
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : null;
  if (!plat || !arch) return null;
  if (plat === 'macos' && arch === 'x64') return null; // only macos-arm64 is built
  return `${BIN_NAME}-${plat}-${arch}`;
}

/**
 * Downloads the latest `zs` release binary for this OS/arch, verifies its
 * sha256, and atomically swaps the running binary. Never throws — any failure
 * returns a result so the caller keeps running the current version.
 */
export async function selfUpdate(currentVersion: string, execPath: string): Promise<SelfUpdateResult> {
  const asset = assetName();
  if (!asset) return { updated: false, fromVersion: currentVersion, reason: 'unsupported-arch' };

  let latestTag: string;
  try {
    const res = await axios.get(`https://api.github.com/repos/${REPO}/releases/latest`, {
      timeout: 15000,
      headers: { Accept: 'application/vnd.github+json' },
    });
    latestTag = res.data?.tag_name;
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    return { updated: false, fromVersion: currentVersion, reason: status === 403 ? 'rate-limited' : 'error' };
  }

  if (!latestTag || !isNewerVersion(latestTag, currentVersion)) {
    return { updated: false, fromVersion: currentVersion, reason: 'up-to-date' };
  }

  const base = `https://github.com/${REPO}/releases/download/${latestTag}`;
  const tmp = join(dirname(execPath), `.${BIN_NAME}.update-${process.pid}`);
  try {
    const bin = await axios.get(`${base}/${asset}`, { responseType: 'stream', timeout: 120000 });
    await pipeline(bin.data, createWriteStream(tmp, { mode: 0o755 }));

    const expected = await fetchChecksum(`${base}/${asset}.sha256`);
    if (expected) {
      const actual = await sha256File(tmp);
      if (actual !== expected) throw new Error(`checksum mismatch (expected ${expected}, got ${actual})`);
    }

    await chmod(tmp, 0o755);
    await rename(tmp, execPath);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    const code = (err as NodeJS.ErrnoException)?.code;
    const reason: SelfUpdateReason = code === 'EACCES' || code === 'EPERM' ? 'permission' : 'error';
    return { updated: false, fromVersion: currentVersion, toVersion: latestTag, reason };
  }

  return { updated: true, fromVersion: currentVersion, toVersion: latestTag, reason: 'updated' };
}

/** Latest tag if newer than current, else null. Cheap check (no download). */
export async function latestNewerTag(currentVersion: string): Promise<string | null> {
  try {
    const res = await axios.get(`https://api.github.com/repos/${REPO}/releases/latest`, {
      timeout: 8000,
      headers: { Accept: 'application/vnd.github+json' },
    });
    const tag = res.data?.tag_name;
    return tag && isNewerVersion(tag, currentVersion) ? tag : null;
  } catch {
    return null;
  }
}

async function fetchChecksum(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, { responseType: 'text', timeout: 15000 });
    return String(res.data).trim().split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}
