import { Command } from 'commander';
import chalk from 'chalk';
import { loginUseCase, logoutUseCase } from '../../application/usecases/LoginUseCase';
import { whoamiUseCase } from '../../application/usecases/WhoamiUseCase';
import { handleError } from '../formatting/errors';
import { getConfigValue } from '../../infrastructure/config/store';
import { prompt, promptPassword } from '../io/prompt';

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Log in to ZeroServer Community Cloud')
    .option('-e, --email <email>', 'Account email')
    .option('-p, --password <password>', 'Account password')
    .action(async (opts) => {
      try {
        const email: string = opts.email ?? (await prompt('Email: '));
        const password: string = opts.password ?? (await promptPassword('Password: '));

        const payload = await loginUseCase(email, password);
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
        console.log(`${chalk.bold(user.username)} <${user.email}> [${user.role}]`);
      } catch (err) {
        handleError(err);
      }
    });
}
