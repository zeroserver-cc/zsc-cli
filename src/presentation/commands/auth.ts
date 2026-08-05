import { Command } from 'commander';
import chalk from 'chalk';
import { logoutUseCase } from '../../application/usecases/LoginUseCase';
import { loginWithTokenUseCase } from '../../application/usecases/LoginWithTokenUseCase';
import { loginWithApiKeyUseCase } from '../../application/usecases/LoginWithApiKeyUseCase';
import { whoamiUseCase } from '../../application/usecases/WhoamiUseCase';
import { getActiveAccountUseCase } from '../../application/usecases/AccountUseCase';
import { formatAccountLine } from './account';
import { handleError } from '../formatting/errors';
import { getConfigValue } from '../../infrastructure/config/store';
import { describeProfileSource, resolveActiveProfile } from '../../infrastructure/config/profile';
import { prompt, promptPassword, readStdin } from '../io/prompt';
import { loginWithTwoFactor } from '../loginFlow';

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Log in to ZeroServer Community Cloud')
    .option('-e, --email <email>', 'Account email')
    .option('-p, --password <password>', 'Account password')
    .option('--otp <code>', '2FA code (TOTP or recovery code), for non-interactive login')
    .option('--api-key', 'Log in with a portal API key (zsk_...) instead of email/password')
    .option('--token-stdin', 'Read the API key from stdin (with --api-key, for CI)')
    .option('-t, --token <token>', 'Access token (skips email/password login)')
    .option('--refresh-token <refreshToken>', 'Optional refresh token when using --token')
    .option('--profile <name>', 'Store the session under this profile')
    .action(async (opts) => {
      try {
        const profile = resolveActiveProfile();
        const profileNote = chalk.gray(`Session stored in profile "${profile.name}".`);

        if (opts.apiKey) {
          const apiKey = opts.tokenStdin ? (await readStdin()).trim() : await promptPassword('API key: ');
          const result = await loginWithApiKeyUseCase(apiKey);
          console.log(chalk.green('✓'), `Logged in as ${chalk.bold(result.user.username)} (${result.user.role}) via API key`);
          console.log(profileNote);
          return;
        }

        if (opts.token) {
          const result = await loginWithTokenUseCase(opts.token, opts.refreshToken);
          console.log(chalk.green('✓'), `Logged in as ${chalk.bold(result.user.username)} (${result.user.role})`);
          if (opts.refreshToken) {
            console.log(chalk.gray('Refresh token stored for automatic revalidation.'));
          } else {
            console.log(chalk.yellow('No refresh token provided; session will not be renewable once it expires.'));
          }
          console.log(profileNote);
          return;
        }

        const email: string = opts.email ?? (await prompt('Email: '));
        const password: string = opts.password ?? (await promptPassword('Password: '));

        const payload = await loginWithTwoFactor(email, password, opts.otp);
        console.log(chalk.green('✓'), `Logged in as ${chalk.bold(payload.user.username)} (${payload.user.role})`);
        console.log(chalk.gray(`Token expires: ${payload.expiresAt}`));
        console.log(profileNote);
      } catch (err) {
        handleError(err);
      }
    });

  program
    .command('logout')
    .description('Clear the current session')
    .option('--profile <name>', 'Clear the session of this profile')
    .action(() => {
      const profile = resolveActiveProfile();
      logoutUseCase();
      console.log(chalk.green('✓'), `Logged out of profile "${profile.name}".`);
    });

  program
    .command('whoami')
    .description('Show the currently authenticated user')
    .action(async () => {
      try {
        const profile = resolveActiveProfile();
        const token = getConfigValue('accessToken');
        if (!token) {
          console.log(chalk.yellow(`Not logged in (profile "${profile.name}").`));
          process.exit(1);
        }
        const user = await whoamiUseCase();
        // Fall back to the active role alone if roles comes back null or empty.
        const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
        const rolesLabel = roles
          .map((role) => (role === user.role ? chalk.green(role) : chalk.gray(role)))
          .join(', ');
        const authSuffix = getConfigValue('authType') === 'apikey' ? chalk.gray(' (api key)') : '';
        console.log(`${chalk.bold(user.username)} <${user.email}> [${rolesLabel}]${authSuffix}`);
        console.log(`Profile: ${profile.name} ${chalk.gray(`(${describeProfileSource(profile.source)})`)}`);
        console.log(formatAccountLine(await getActiveAccountUseCase()));
      } catch (err) {
        handleError(err);
      }
    });
}
