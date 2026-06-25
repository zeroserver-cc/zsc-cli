import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import { loginUseCase, logoutUseCase } from '../../application/usecases/LoginUseCase';
import { whoamiUseCase } from '../../application/usecases/WhoamiUseCase';
import { handleError } from '../formatting/errors';
import { getConfigValue } from '../../infrastructure/config/store';

function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    // Raw mode so each keystroke arrives as a separate event without terminal echo
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let password = '';

    const onData = (char: string) => {
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (char === '') { // Ctrl+C
        process.stdout.write('\n');
        process.exit(0);
      } else if (char === '' || char === '\b') { // Backspace / Delete
        password = password.slice(0, -1);
      } else {
        password += char;
      }
    };

    process.stdin.on('data', onData);
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
