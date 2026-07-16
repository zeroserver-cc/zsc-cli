import { execSync, spawn } from 'child_process';

/** True when the current process is running as root (Unix) or always true on Windows. */
export function isRoot(): boolean {
  if (process.platform === 'win32') return true;
  try {
    return typeof process.getuid === 'function' && process.getuid() === 0;
  } catch {
    return false;
  }
}

/** Best-effort check for whether `sudo` is available on this system. */
export function canElevate(): boolean {
  if (process.platform === 'win32') return false;
  try {
    execSync('command -v sudo', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-run the current executable with `sudo` and the supplied CLI arguments.
 * Returns the child process exit code. Stdio is inherited so the password
 * prompt and any output reach the user's terminal directly.
 */
export function elevateAndRun(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('sudo', [process.execPath, ...args], {
      stdio: 'inherit',
      detached: false,
    });

    child.on('exit', (code, signal) => {
      resolve(signal ? 128 + 1 : (code ?? 0));
    });

    child.on('error', (err) => {
      console.error('Failed to spawn sudo:', err.message);
      resolve(1);
    });
  });
}
