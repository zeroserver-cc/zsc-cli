import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface ConfigData {
  backendUrl: string;
  token?: string;
  role?: string;
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

// Always defined: `read()` merges DEFAULTS, so callers never need their own fallback.
export function getBackendUrl(): string {
  return read().backendUrl;
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
