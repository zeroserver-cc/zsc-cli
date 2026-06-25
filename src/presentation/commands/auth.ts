import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import { loginUseCase, logoutUseCase } from '../../application/usecases/LoginUseCase';
import { whoamiUseCase } from '../../application/usecases/WhoamiUseCase';
import { handleError } from '../formatting/errors';
import { getConfigValue } from '../../infrastructure/config/store';

function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(prompt);
    process.stdin.setRawMode?.(true);
    let password = '';
    process.stdin.on('data', (char: Buffer) => {
      const c = char.toString();
      if (c === '\r' || c === '\n') {
        process.stdin.setRawMode?.(false);
        process.stdout.write('\n');
        rl.close();
        resolve(password);
      } else if (c === '') {
        process.exit(0);
      } else if (c === '') {
        password = password.slice(0, -1);
      } else {
        password += c;
      }
    });
  });
}

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Log in to ZeroServer Community Cloud')
    .option('-e, --email <email>', 'Account email')
    .option('-p, --password <password>', 'Account password')
    .action(async (opts) => {
      try {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const email: string = opts.email ?? await new Promise<string>((res) => rl.question('Email: ', res));

        let password: string = opts.password;
        if (!password) {
          rl.close();
          password = await promptPassword('Password: ');
        } else {
          rl.close();
        }

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
        const token = getConfigValue('token');
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
