import { getConfigValue, setConfigValue } from '../../infrastructure/config/store';
import { latestNewerTag, selfUpdate } from '../../infrastructure/self-update/updater';
import { VERSION } from '../../version';

const THROTTLE_MS = 24 * 60 * 60 * 1000; // once a day

/** True only when self-update is appropriate: the installed binary, interactive, not throttled. */
export function isPackagedBinary(): boolean {
  return Boolean((process as unknown as { pkg?: unknown }).pkg);
}

function shouldAutoCheck(): boolean {
  if (process.env.ZSC_NO_AUTO_UPDATE === '1') return false;
  if (!isPackagedBinary()) return false; // dev run: execPath is node, never replace it
  if (!process.stdout.isTTY) return false; // scripts / pipes
  if (process.env.CI) return false;
  const last = getConfigValue('lastUpdateCheck');
  if (last) {
    const age = Date.now() - new Date(last).getTime();
    if (Number.isFinite(age) && age >= 0 && age < THROTTLE_MS) return false;
  }
  return true;
}

/**
 * Best-effort background auto-update run before a command. Throttled to once a
 * day and skipped for non-interactive/scripted use. Notices go to stderr so they
 * never corrupt piped stdout; the current command keeps running the old code and
 * the update takes effect on the next invocation.
 */
export async function maybeAutoUpdate(): Promise<void> {
  if (!shouldAutoCheck()) return;
  // Stamp before the network call so a failure still throttles the next run.
  setConfigValue('lastUpdateCheck', new Date().toISOString());

  const tag = await latestNewerTag(VERSION);
  if (!tag) return;

  process.stderr.write(`A new zs version (${tag}) is available — updating…\n`);
  const result = await selfUpdate(VERSION, process.execPath);
  if (result.updated) {
    process.stderr.write(`Updated zs ${result.fromVersion} → ${result.toVersion}. Takes effect on your next command.\n`);
  } else if (result.reason === 'permission') {
    process.stderr.write(`Update available but ${process.execPath} isn't writable. Run: sudo zs upgrade\n`);
  }
  // Any other failure stays silent — the current command must not be disrupted.
}
