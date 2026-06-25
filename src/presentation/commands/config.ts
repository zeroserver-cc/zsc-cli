import { Command } from 'commander';
import chalk from 'chalk';
import { getConfigValue, setConfigValue } from '../../infrastructure/config/store';

const ALLOWED_KEYS = ['backend-url'] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];

const KEY_MAP: Record<AllowedKey, 'backendUrl'> = {
  'backend-url': 'backendUrl',
};

export function registerConfigCommands(program: Command): void {
  const config = program.command('config').description('Manage CLI configuration');

  config
    .command('set <key> <value>')
    .description(`Set a config value. Keys: ${ALLOWED_KEYS.join(', ')}`)
    .action((key: string, value: string) => {
      if (!ALLOWED_KEYS.includes(key as AllowedKey)) {
        console.error(chalk.red(`Unknown key "${key}". Allowed: ${ALLOWED_KEYS.join(', ')}`));
        process.exit(1);
      }
      setConfigValue(KEY_MAP[key as AllowedKey], value);
      console.log(chalk.green('✓'), `${key} = ${value}`);
    });

  config
    .command('get <key>')
    .description(`Get a config value. Keys: ${ALLOWED_KEYS.join(', ')}`)
    .action((key: string) => {
      if (!ALLOWED_KEYS.includes(key as AllowedKey)) {
        console.error(chalk.red(`Unknown key "${key}". Allowed: ${ALLOWED_KEYS.join(', ')}`));
        process.exit(1);
      }
      const val = getConfigValue(KEY_MAP[key as AllowedKey]);
      console.log(val ?? chalk.gray('(not set)'));
    });
}
