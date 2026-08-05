import { homedir } from 'os';
import { join } from 'path';

// Paths are computed per call instead of cached at module load so tests can
// relocate the home directory (jest.mock of os.homedir) and each test gets a
// clean, isolated config tree.
export function configDir(): string {
  return join(homedir(), '.config', 'zsc');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

export function sessionsDir(): string {
  return join(configDir(), 'sessions');
}

export function sessionPath(profile: string): string {
  return join(sessionsDir(), `${profile}.json`);
}
