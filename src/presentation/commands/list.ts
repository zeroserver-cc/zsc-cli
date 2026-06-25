import { Command } from 'commander';
import ora from 'ora';
import { listApplicationsUseCase } from '../../application/usecases/ListApplicationsUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { printAppTable } from '../formatting/table';
import { handleError } from '../formatting/errors';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List all deployed applications and their status')
    .action(async () => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Fetching deployments…').start();
      try {
        const rows = await listApplicationsUseCase();
        spinner.stop();
        printAppTable(rows);
      } catch (err) {
        spinner.fail('Failed to fetch deployments.');
        handleError(err);
      }
    });
}
