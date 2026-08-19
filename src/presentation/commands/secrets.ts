import fs from 'fs';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireRole } from '../../application/usecases/requireRole';
import {
  setAppSecretUseCase,
  listAppSecretsUseCase,
  deleteAppSecretUseCase,
  importAppSecretsUseCase
} from '../../application/usecases/SecretsUseCase';
import { parseEnvFile, KEY_PATTERN } from '../../application/manifest/envFile';
import { handleError } from '../formatting/errors';
import { prompt, promptPassword, readStdin } from '../io/prompt';

// Fast local validation so a typo fails before any prompt or network call,
// with the same rule the backend and the .env parser apply.
function requireValidSecretKey(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw new Error(
      `Invalid KEY "${key}": use letters, digits and underscores, starting with a letter or underscore.`
    );
  }
}

// The value comes from a hidden prompt (TTY) or from stdin (piped, for CI).
// It is never accepted as a positional argument: argv lands in shell history
// and process listings. Exported for tests.
export async function readSecretValue(key: string): Promise<string> {
  const value = process.stdin.isTTY
    ? await promptPassword(`Value for ${key}: `)
    : // Strip only the single trailing newline a pipe like `echo "$V"` adds;
      // any other whitespace can be significant in a secret, so no trim().
      (await readStdin()).replace(/\r?\n$/, '');
  if (!value) throw new Error('Empty secret value; aborting.');
  return value;
}

export function registerSecretsCommands(program: Command): void {
  const secrets = program
    .command('secrets')
    .description('Manage application secrets (env values stored encrypted, write-only)');

  secrets
    .command('set <app> <KEY>')
    .description(
      'Set (or replace) a secret of an application. The value is prompted with echo off, or read from stdin when piped.'
    )
    .action(async (app: string, key: string) => {
      requireRole(['developer', 'admin']);
      let spinner: ReturnType<typeof ora> | undefined;
      try {
        requireValidSecretKey(key);
        const value = await readSecretValue(key);
        spinner = ora(`Saving secret ${chalk.cyan(key)}…`).start();
        await setAppSecretUseCase(app, key, value);
        spinner.succeed(chalk.green(`Secret ${chalk.bold(key)} saved for ${chalk.bold(app)}.`));
        // Assert only what the CLI can know: the value left over HTTPS and is
        // not kept on this machine. The backend stores it encrypted at rest.
        console.log(chalk.gray('The value was sent over HTTPS and is never returned by the API.'));
      } catch (err) {
        spinner?.stop();
        handleError(err);
      }
    });

  secrets
    .command('list <app>')
    .alias('ls')
    .description(
      'List the secret keys of an application (only a masked value hint is shown, never the value)'
    )
    .action(async (app: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Fetching secrets…').start();
      try {
        const items = await listAppSecretsUseCase(app);
        spinner.stop();
        if (!items.length) {
          console.log(
            chalk.yellow(`No secrets for ${app}. Add one with "zs secrets set ${app} <KEY>".`)
          );
          return;
        }
        for (const s of items) {
          const maskedValue = s.hint ? `****${s.hint}` : '-';
          const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '-';
          console.log(
            `${chalk.bold(s.key)}  ${chalk.gray('value=')}${maskedValue}  ${chalk.gray('updated=')}${updated}`
          );
        }
      } catch (err) {
        spinner.fail('Failed to fetch secrets.');
        handleError(err);
      }
    });

  secrets
    .command('delete <app> <KEY>')
    .alias('rm')
    .description('Delete a secret of an application')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (app: string, key: string, opts: { yes?: boolean }) => {
      requireRole(['developer', 'admin']);
      let spinner: ReturnType<typeof ora> | undefined;
      try {
        requireValidSecretKey(key);
        if (!opts.yes) {
          const answer = await prompt(
            `Delete secret ${key} from ${app}? The value is gone for good. [y/N] `
          );
          if (answer.trim().toLowerCase() !== 'y') {
            console.log('Aborted.');
            return;
          }
        }
        spinner = ora(`Deleting secret ${chalk.cyan(key)}…`).start();
        const removed = await deleteAppSecretUseCase(app, key);
        if (removed) {
          spinner.succeed(
            chalk.green(`Secret ${chalk.bold(key)} deleted from ${chalk.bold(app)}.`)
          );
        } else {
          spinner.warn(`No secret ${key} found for ${app}.`);
        }
      } catch (err) {
        // handleError exits the process; stop the spinner first or it keeps
        // animating over the error output.
        spinner?.stop();
        handleError(err);
      }
    });

  secrets
    .command('import <app> <file>')
    .description(
      'Bulk upsert secrets from a .env file (KEY=VALUE lines; malformed lines are reported and skipped)'
    )
    .action(async (app: string, file: string) => {
      requireRole(['developer', 'admin']);
      let spinner: ReturnType<typeof ora> | undefined;
      try {
        if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
        const { vars, malformedLines } = parseEnvFile(fs.readFileSync(file, 'utf-8'));
        for (const line of malformedLines) {
          console.log(chalk.yellow(`${file}: line ${line} ignored (expected KEY=VALUE)`));
        }
        if (vars.length === 0) {
          console.log(chalk.yellow('No KEY=VALUE entries to import.'));
          return;
        }
        spinner = ora(`Importing ${vars.length} secret(s) into ${chalk.cyan(app)}…`).start();
        const result = await importAppSecretsUseCase(app, vars);
        if (result.failures.length === 0) {
          spinner.succeed(
            chalk.green(`Imported ${result.imported} secret(s) into ${chalk.bold(app)}.`)
          );
        } else {
          spinner.warn(
            `Imported ${result.imported} of ${vars.length} secret(s); ${result.failures.length} failed.`
          );
          for (const failure of result.failures) {
            console.log(chalk.red(`  ${failure.key}: ${failure.error}`));
          }
          process.exitCode = 1;
        }
        if (result.imported > 0) {
          console.log(
            chalk.yellow(
              `Note: ${file} still holds these values in plaintext. Remove it or keep it out of git.`
            )
          );
        }
      } catch (err) {
        spinner?.stop();
        handleError(err);
      }
    });
}
