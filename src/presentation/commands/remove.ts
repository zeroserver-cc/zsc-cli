import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { removeApplicationUseCase } from '../../application/usecases/RemoveApplicationUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { handleError } from '../formatting/errors';

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove <instance-id>')
    .alias('rm')
    .description('Remove a deployment: tears down the container and deletes the record')
    .action(async (instanceId: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora(`Removing ${chalk.cyan(instanceId)}…`).start();
      try {
        await removeApplicationUseCase(instanceId);
        spinner.succeed(chalk.green('Deployment removed.'));
      } catch (err) {
        spinner.fail('Remove command failed.');
        handleError(err);
      }
    });
}
