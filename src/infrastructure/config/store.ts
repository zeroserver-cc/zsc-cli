import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface ConfigData {
  backendUrl: string;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  role?: string;
  /** ISO timestamp of the last auto-update check, used to throttle it to once a day. */
  lastUpdateCheck?: string;
}

const CONFIG_DIR = join(homedir(), '.config', 'zsc');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
// Points at the ZeroServer production API out of the box, so a fresh install can
// `zs login` and `zs deploy` with no configuration. Override for local/self-hosted
// backends with `zs config set backend-url <url>`. Single source of truth — do not
// duplicate this literal elsewhere; consume `getBackendUrl()` instead.
export const DEFAULT_BACKEND_URL = 'https://api.zeroserver.cc';
const DEFAULTS: ConfigData = { backendUrl: DEFAULT_BACKEND_URL };

function read(): ConfigData {
  try {
    if (existsSync(CONFIG_PATH)) {
      return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) };
    }
  } catch {}
  return { ...DEFAULTS };
}

function write(data: ConfigData): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function getConfigValue(key: keyof ConfigData): string | undefined {
  return read()[key];
}

// Always returns a usable base URL. `read()` merges DEFAULTS, but config.json is
// parsed untyped, so a corrupted/hand-edited file could still yield null, a number
// or an empty string — coerce those back to the default instead of building
// invalid URLs like `null/graphql`.
export function getBackendUrl(): string {
  const value = read().backendUrl;
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed !== '' ? trimmed : DEFAULT_BACKEND_URL;
}

export function setConfigValue(key: keyof ConfigData, value: string): void {
  const data = read();
  (data[key] as string) = value;
  write(data);
}

export function deleteConfigValue(key: keyof ConfigData): void {
  const data = read();
  delete data[key];
  write(data);
}
