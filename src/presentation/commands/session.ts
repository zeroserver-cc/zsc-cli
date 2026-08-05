import { Command } from 'commander';
import chalk from 'chalk';
import {
  listSessionProfiles,
  profileHasSession,
  setConfigValue,
} from '../../infrastructure/config/store';
import {
  assertValidProfileName,
  describeProfileSource,
  resolveActiveProfile,
} from '../../infrastructure/config/profile';
import { handleError } from '../formatting/errors';

function formatIdentity(username?: string, email?: string): string {
  if (username && email) return `${chalk.bold(username)} <${email}>`;
  if (username) return chalk.bold(username);
  // Sessions created before profiles existed carry no identity; the user can
  // re-login to populate it.
  return chalk.gray('(unknown user — log in again to identify)');
}

export function registerSessionCommands(program: Command): void {
  const session = program.command('session').description('Manage session profiles (multiple logins)');

  session
    .command('list')
    .description('List session profiles, marking the active one')
    .action(() => {
      try {
        const active = resolveActiveProfile();
        const profiles = listSessionProfiles();

        // The active selection may point at a profile never logged into; show
        // it anyway so the user sees where commands will authenticate.
        if (!profiles.some((profile) => profile.name === active.name)) {
          profiles.push({ name: active.name, hasSession: false });
          profiles.sort((a, b) => a.name.localeCompare(b.name));
        }

        for (const profile of profiles) {
          const isActive = profile.name === active.name;
          const marker = isActive ? chalk.green('*') : ' ';
          const identity = profile.hasSession
            ? formatIdentity(profile.username, profile.email)
            : chalk.gray('(no session)');
          const source = isActive ? chalk.gray(` (active — ${describeProfileSource(active.source)})`) : '';
          console.log(`${marker} ${profile.name}: ${identity}${source}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  session
    .command('use <profile>')
    .description('Set the global default session profile')
    .action((name: string) => {
      try {
        assertValidProfileName(name);
        setConfigValue('activeProfile', name);
        console.log(chalk.green('✓'), `Active profile set to "${name}".`);
        if (!profileHasSession(name)) {
          console.log(chalk.gray(`Profile "${name}" has no session yet; you will be asked to log in on the next command.`));
        }
      } catch (err) {
        handleError(err);
      }
    });
}
