import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireRole } from '../../application/usecases/requireRole';
import {
  registryLoginUseCase,
  registryListUseCase,
  registryLogoutUseCase,
} from '../../application/usecases/RegistryUseCase';
import { handleError } from '../formatting/errors';
import { prompt, promptPassword, readStdin } from '../io/prompt';
import { resolveRegistryLogin } from './resolveRegistryLogin';

export function registerRegistryCommands(program: Command): void {
  const registry = program
    .command('registry')
    .description('Manage credentials for pulling private images');

  registry
    .command('login [registryHost]')
    .description('Store a registry credential (e.g. ghcr.io) to pull private images')
    .option('-u, --username <username>', 'Registry username')
    .option(
      '--token-stdin',
      'Read the token from stdin instead of prompting (non-interactive, for CI). Requires registryHost and --username.',
    )
    .action(async (registryHost: string | undefined, opts: { username?: string; tokenStdin?: boolean }) => {
      requireRole(['developer', 'admin']);
      let spinner: ReturnType<typeof ora> | undefined;
      try {
        const inputs = await resolveRegistryLogin(
          { registryHost, username: opts.username, tokenStdin: opts.tokenStdin },
          {
            promptHost: () => prompt('Registry host (e.g. ghcr.io): '),
            promptUsername: () => prompt('Username: '),
            // Read the token with echo off so it never lands on screen or in history.
            promptToken: () => promptPassword('Token (read-only / read:packages): '),
            readStdin,
          },
        );

        spinner = ora('Saving registry credential…').start();
        const cred = await registryLoginUseCase(inputs);
        spinner.succeed(chalk.green(`Credential saved for ${chalk.bold(cred.registryHost)} (user ${cred.username}).`));
        // Assert only what the CLI can know: the token left over HTTPS and is
        // not kept on this machine. The backend stores it encrypted at rest.
        console.log(chalk.gray('The token was sent over HTTPS and is not stored on this machine.'));
      } catch (err) {
        spinner?.stop();
        handleError(err);
      }
    });

  registry
    .command('list')
    .alias('ls')
    .description('List your stored registry credentials (only a masked token hint is shown, never the full token)')
    .action(async () => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Fetching registry credentials…').start();
      try {
        const creds = await registryListUseCase();
        spinner.stop();
        if (!creds.length) {
          console.log(chalk.yellow('No registry credentials. Add one with "zs registry login".'));
          return;
        }
        for (const c of creds) {
          const maskedToken = c.tokenHint ? `****${c.tokenHint}` : '-';
          console.log(
            `${chalk.bold(c.registryHost)}  ${chalk.gray('user=')}${c.username}  ${chalk.gray('token=')}${maskedToken}`,
          );
        }
      } catch (err) {
        spinner.fail('Failed to fetch registry credentials.');
        handleError(err);
      }
    });

  registry
    .command('logout <registryHost>')
    .description('Remove the stored credential for a registry host')
    .action(async (registryHost: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Removing registry credential…').start();
      try {
        const removed = await registryLogoutUseCase(registryHost);
        if (removed) {
          spinner.succeed(chalk.green(`Credential removed for ${chalk.bold(registryHost)}.`));
        } else {
          spinner.warn(`No credential found for ${registryHost}.`);
        }
      } catch (err) {
        spinner.fail('Failed to remove registry credential.');
        handleError(err);
      }
    });
}
