import { Command } from 'commander';
import ora from 'ora';
import { getLogsUseCase } from '../../application/usecases/GetLogsUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { handleError } from '../formatting/errors';

export function registerLogsCommand(program: Command): void {
  program
    .command('logs <instance-id>')
    .description('Show logs for a deployed application instance')
    .action(async (instanceId: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Fetching logs…').start();
      try {
        const logs = await getLogsUseCase(instanceId);
        spinner.stop();
        console.log(logs);
      } catch (err) {
        spinner.fail('Failed to fetch logs.');
        handleError(err);
      }
    });
}
