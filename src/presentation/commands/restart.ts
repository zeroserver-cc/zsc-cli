import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { restartApplicationUseCase } from '../../application/usecases/RestartApplicationUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { handleError } from '../formatting/errors';

export function registerRestartCommand(program: Command): void {
  program
    .command('restart <instance-id>')
    .description('Restart an application instance')
    .action(async (instanceId: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora(`Restarting ${chalk.cyan(instanceId)}…`).start();
      try {
        const result = await restartApplicationUseCase(instanceId);
        spinner.succeed(`Instance status: ${chalk.bold(result.status)}`);
      } catch (err) {
        spinner.fail('Restart command failed.');
        handleError(err);
      }
    });
}
