import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { stopApplicationUseCase } from '../../application/usecases/StopApplicationUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { handleError } from '../formatting/errors';

export function registerStopCommand(program: Command): void {
  program
    .command('stop <instance-id>')
    .description('Stop a running application instance')
    .action(async (instanceId: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora(`Stopping ${chalk.cyan(instanceId)}…`).start();
      try {
        const result = await stopApplicationUseCase(instanceId);
        spinner.succeed(`Instance status: ${chalk.bold(result.status)}`);
      } catch (err) {
        spinner.fail('Stop command failed.');
        handleError(err);
      }
    });
}
