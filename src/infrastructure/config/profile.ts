import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'smol-toml';
import { configPath } from './paths';

/** Profile used when nothing selects one explicitly. */
export const DEFAULT_PROFILE = 'default';

/** Where the active profile came from, highest precedence first. */
export type ProfileSource = 'flag' | 'env' | 'zs.toml' | 'global' | 'default';

export interface ActiveProfile {
  name: string;
  source: ProfileSource;
}

// Profile names become file names under ~/.config/zsc/sessions/, so reject
// anything outside a conservative set instead of sanitizing (a crafted name
// like "../other" must never reach a path join).
const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertValidProfileName(name: string): void {
  if (!PROFILE_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid profile name "${name}". Use letters, digits, '.', '_' or '-', starting with a letter or digit.`,
    );
  }
}

let cliProfileFlag: string | undefined;

/**
 * Records the global --profile flag for the rest of the process. Called from a
 * commander hook before any command action runs; the name is validated here so
 * no caller downstream has to re-check it.
 */
export function setProfileFlag(name: string | undefined): void {
  if (name !== undefined) assertValidProfileName(name);
  cliProfileFlag = name;
}

// Reads config.json directly instead of going through the store: the store
// resolves the active profile to find the session file, so routing this read
// through it would be circular.
function readGlobalActiveProfile(): string | undefined {
  try {
    if (!existsSync(configPath())) return undefined;
    const raw = JSON.parse(readFileSync(configPath(), 'utf-8')) as { activeProfile?: unknown };
    if (typeof raw.activeProfile !== 'string') return undefined;
    const name = raw.activeProfile.trim();
    return name !== '' ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads the `session` field of the project-level zs.toml. The file is anchored
 * to the zs.yaml directory, and since the manifest search is cwd-only today
 * that means ./zs.toml. A malformed file or a non-string `session` is a hard
 * error: silently ignoring it would run commands against the wrong account.
 */
function readZsTomlSession(cwd: string): string | undefined {
  const tomlPath = join(cwd, 'zs.toml');
  if (!existsSync(tomlPath)) return undefined;

  let parsed: unknown;
  try {
    parsed = parse(readFileSync(tomlPath, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Could not parse ${tomlPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const session = (parsed as { session?: unknown }).session;
  if (session === undefined || session === null) return undefined;
  if (typeof session !== 'string') {
    throw new Error(`Invalid "session" in ${tomlPath}: expected a string, e.g. session = "cliente-x".`);
  }
  const name = session.trim();
  try {
    assertValidProfileName(name);
  } catch {
    throw new Error(`Invalid "session" in ${tomlPath}: "${name}" is not a valid profile name.`);
  }
  return name;
}

/**
 * Resolves which session profile this invocation acts on.
 * Precedence: --profile flag > ZS_PROFILE env > zs.toml `session` >
 * `zs session use` global default > the implicit `default` profile.
 */
export function resolveActiveProfile(cwd: string = process.cwd()): ActiveProfile {
  if (cliProfileFlag) return { name: cliProfileFlag, source: 'flag' };

  const envName = process.env.ZS_PROFILE?.trim();
  if (envName) {
    assertValidProfileName(envName);
    return { name: envName, source: 'env' };
  }

  const tomlName = readZsTomlSession(cwd);
  if (tomlName) return { name: tomlName, source: 'zs.toml' };

  const globalName = readGlobalActiveProfile();
  if (globalName) return { name: globalName, source: 'global' };

  return { name: DEFAULT_PROFILE, source: 'default' };
}

/** Human-readable origin of a profile selection, for `whoami`/`session list`. */
export function describeProfileSource(source: ProfileSource): string {
  switch (source) {
    case 'flag':
      return '--profile flag';
    case 'env':
      return 'ZS_PROFILE env';
    case 'zs.toml':
      return 'zs.toml';
    case 'global':
      return 'zs session use';
    case 'default':
      return 'default';
  }
}
