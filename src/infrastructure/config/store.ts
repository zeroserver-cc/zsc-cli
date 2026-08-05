import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { configDir, configPath, sessionPath, sessionsDir } from './paths';
import { DEFAULT_PROFILE, resolveActiveProfile } from './profile';

interface ConfigData {
  backendUrl: string;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  role?: string;
  /** Full role membership set of the logged-in user. Absent in sessions created before multi-role support. */
  roles?: string[];
  /** How the session authenticates: JWT (default, refreshable) or a portal API key (no refresh flow). */
  authType?: 'jwt' | 'apikey';
  /** Account the session is acting as (teams). Absent means the user's own account. */
  activeAccountId?: string;
  /** Login identity, recorded at login so `zs session list` can show who each profile belongs to. */
  username?: string;
  email?: string;
  /** Profile selected with `zs session use`, the global default when no flag/env/zs.toml selects one. */
  activeProfile?: string;
  /** ISO timestamp of the last auto-update check, used to throttle it to once a day. */
  lastUpdateCheck?: string;
}

// Points at the ZeroServer production API out of the box, so a fresh install can
// `zs login` and `zs deploy` with no configuration. Override for local/self-hosted
// backends with `zs config set backend-url <url>`. Single source of truth — do not
// duplicate this literal elsewhere; consume `getBackendUrl()` instead.
export const DEFAULT_BACKEND_URL = 'https://api.zeroserver.cc';
const DEFAULTS: ConfigData = { backendUrl: DEFAULT_BACKEND_URL };

// Global settings live in config.json and are shared by every profile; session
// fields live in sessions/<profile>.json so several logins can coexist.
const GLOBAL_KEYS = new Set<keyof ConfigData>(['backendUrl', 'lastUpdateCheck', 'activeProfile']);
const SESSION_KEYS: readonly (keyof ConfigData)[] = [
  'token',
  'accessToken',
  'refreshToken',
  'role',
  'roles',
  'authType',
  'activeAccountId',
  'username',
  'email',
];

function readJsonFile(path: string): Record<string, unknown> {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    }
  } catch {}
  return {};
}

function writeJsonFile(path: string, data: Record<string, unknown>): void {
  const dir = path.startsWith(sessionsDir()) ? sessionsDir() : configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Credentials live in this tree: keep it owner-only even if someone loosened
  // permissions by hand. Best-effort so a read-only dir fails on the write below.
  try {
    chmodSync(dir, 0o700);
  } catch {}
  // Write to a temp file and rename atomically: a concurrent reader must never
  // see a half-written file. A partial JSON parses as {} in readJsonFile and the
  // next read-modify-write would clobber the real contents — observed in a race
  // between two processes to destroy a freshly migrated session.
  const tmp = join(dir, `.${basename(path)}.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
  // writeFileSync's mode only applies at creation; an existing file kept its
  // old permissions, so re-tighten after the rename (a 0644 session file would
  // otherwise stay world-readable forever).
  try {
    chmodSync(path, 0o600);
  } catch {}
}

// Sessions used to live inside config.json itself. On first access after the
// upgrade, move any legacy session fields into the `default` profile so the
// existing login survives untouched; global settings stay in config.json.
let migrationAttempted = false;

function migrateLegacySession(): void {
  if (migrationAttempted) return;
  migrationAttempted = true;
  try {
    if (!existsSync(configPath())) return;
    const raw = readJsonFile(configPath());

    const legacy: Record<string, unknown> = {};
    for (const key of SESSION_KEYS) {
      if (raw[key] !== undefined) legacy[key] = raw[key];
    }
    if (Object.keys(legacy).length === 0) return;

    // Never overwrite a default profile that already exists (e.g. a partial
    // earlier migration); in that case just strip the stale legacy fields.
    if (!existsSync(sessionPath(DEFAULT_PROFILE))) {
      writeJsonFile(sessionPath(DEFAULT_PROFILE), legacy);
    }

    const remaining: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!(SESSION_KEYS as readonly string[]).includes(key)) remaining[key] = value;
    }
    writeJsonFile(configPath(), remaining);
  } catch {
    // A failed migration must not break reads; it is retried on the next write.
  }
}

/** Test-only hook: the migration guard is process-level state that must reset between tests. */
export function resetStoreStateForTests(): void {
  migrationAttempted = false;
}

function read(): ConfigData {
  migrateLegacySession();
  const global = readJsonFile(configPath());
  const session = readJsonFile(sessionPath(resolveActiveProfile().name));
  return { ...DEFAULTS, ...global, ...session } as ConfigData;
}

function writeScoped(key: keyof ConfigData, mutate: (data: Record<string, unknown>) => void): void {
  migrateLegacySession();
  if (GLOBAL_KEYS.has(key)) {
    const data = readJsonFile(configPath());
    mutate(data);
    writeJsonFile(configPath(), data);
  } else {
    const path = sessionPath(resolveActiveProfile().name);
    const data = readJsonFile(path);
    mutate(data);
    writeJsonFile(path, data);
  }
}

export function getConfigValue(key: keyof ConfigData): string | undefined {
  const value = read()[key];
  return typeof value === 'string' ? value : undefined;
}

export function getConfigArray(key: 'roles'): string[] | undefined {
  const value = read()[key];
  // A hand-edited config could mix non-string values into the array; drop them.
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined;
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

export function setConfigValue(key: keyof ConfigData, value: string | string[]): void {
  writeScoped(key, (data) => {
    data[key] = value;
  });
}

export function deleteConfigValue(key: keyof ConfigData): void {
  writeScoped(key, (data) => {
    delete data[key];
  });
}

export interface SessionProfileInfo {
  name: string;
  username?: string;
  email?: string;
  /** True when the profile holds a usable credential (access or refresh token). */
  hasSession: boolean;
}

function toProfileInfo(name: string, data: Record<string, unknown>): SessionProfileInfo {
  const accessToken = typeof data.accessToken === 'string' ? data.accessToken : undefined;
  const refreshToken = typeof data.refreshToken === 'string' ? data.refreshToken : undefined;
  return {
    name,
    username: typeof data.username === 'string' ? data.username : undefined,
    email: typeof data.email === 'string' ? data.email : undefined,
    hasSession: Boolean(accessToken || refreshToken),
  };
}

/** Profiles with a session file on disk, sorted by name. */
export function listSessionProfiles(): SessionProfileInfo[] {
  migrateLegacySession();
  if (!existsSync(sessionsDir())) return [];
  return readdirSync(sessionsDir())
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .sort()
    .map((name) => toProfileInfo(name, readJsonFile(sessionPath(name))));
}

/** Whether a profile exists and holds a usable credential. */
export function profileHasSession(name: string): boolean {
  return toProfileInfo(name, readJsonFile(sessionPath(name))).hasSession;
}
