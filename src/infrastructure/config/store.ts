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
const DEFAULTS: ConfigData = { backendUrl: 'http://localhost:3001' };

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
