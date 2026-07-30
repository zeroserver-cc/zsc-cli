import { Command } from 'commander';
import chalk from 'chalk';
import {
  InvalidTwoFactorCodeError,
  loginUseCase,
  logoutUseCase,
  TwoFactorRequiredError,
} from '../../application/usecases/LoginUseCase';
import { loginWithTokenUseCase } from '../../application/usecases/LoginWithTokenUseCase';
import { whoamiUseCase } from '../../application/usecases/WhoamiUseCase';
import { AuthPayload } from '../../domain/entities/types';
import { handleError } from '../formatting/errors';
import { getConfigValue } from '../../infrastructure/config/store';
import { prompt, promptPassword } from '../io/prompt';

const MAX_OTP_ATTEMPTS = 3;

// Drives the 2FA flow around loginUseCase: prompts for the code when the
// backend requires it and lets the user retry a wrong code (TOTP or recovery
// code) up to MAX_OTP_ATTEMPTS times before giving up.
async function loginWithTwoFactor(
  email: string,
  password: string,
  otp?: string,
): Promise<AuthPayload> {
  let totpCode = otp;
  let failedCodes = 0;
  for (;;) {
    try {
      return await loginUseCase(email, password, totpCode);
    } catch (err) {
      if (err instanceof TwoFactorRequiredError) {
        totpCode = await prompt('2FA code: ');
        continue;
      }
      if (err instanceof InvalidTwoFactorCodeError) {
        failedCodes++;
        if (failedCodes >= MAX_OTP_ATTEMPTS) throw err;
        console.error(chalk.red('Invalid 2FA code. Try again.'));
        totpCode = await prompt('2FA code: ');
        continue;
      }
      throw err;
    }
  }
}

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Log in to ZeroServer Community Cloud')
    .option('-e, --email <email>', 'Account email')
    .option('-p, --password <password>', 'Account password')
    .option('--otp <code>', '2FA code (TOTP or recovery code), for non-interactive login')
    .option('-t, --token <token>', 'Access token (skips email/password login)')
    .option('--refresh-token <refreshToken>', 'Optional refresh token when using --token')
    .action(async (opts) => {
      try {
        if (opts.token) {
          const result = await loginWithTokenUseCase(opts.token, opts.refreshToken);
          console.log(chalk.green('✓'), `Logged in as ${chalk.bold(result.user.username)} (${result.user.role})`);
          if (opts.refreshToken) {
            console.log(chalk.gray('Refresh token stored for automatic revalidation.'));
          } else {
            console.log(chalk.yellow('No refresh token provided; session will not be renewable once it expires.'));
          }
          return;
        }

        const email: string = opts.email ?? (await prompt('Email: '));
        const password: string = opts.password ?? (await promptPassword('Password: '));

        const payload = await loginWithTwoFactor(email, password, opts.otp);
        console.log(chalk.green('✓'), `Logged in as ${chalk.bold(payload.user.username)} (${payload.user.role})`);
        console.log(chalk.gray(`Token expires: ${payload.expiresAt}`));
      } catch (err) {
        handleError(err);
      }
    });

  program
    .command('logout')
    .description('Clear the current session')
    .action(() => {
      logoutUseCase();
      console.log(chalk.green('✓'), 'Logged out.');
    });

  program
    .command('whoami')
    .description('Show the currently authenticated user')
    .action(async () => {
      try {
        const token = getConfigValue('accessToken');
        if (!token) {
          console.log(chalk.yellow('Not logged in.'));
          process.exit(1);
        }
        const user = await whoamiUseCase();
        // Fall back to the active role alone if roles comes back null or empty.
        const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
        const rolesLabel = roles
          .map((role) => (role === user.role ? chalk.green(role) : chalk.gray(role)))
          .join(', ');
        console.log(`${chalk.bold(user.username)} <${user.email}> [${rolesLabel}]`);
      } catch (err) {
        handleError(err);
      }
    });
}
