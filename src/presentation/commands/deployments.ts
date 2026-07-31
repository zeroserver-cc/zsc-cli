import { Command } from 'commander';
import ora from 'ora';
import { listDeploymentsUseCase } from '../../application/usecases/ListDeploymentsUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { printDeploymentsTable } from '../formatting/table';
import { handleError } from '../formatting/errors';

export function registerDeploymentsCommand(program: Command): void {
  program
    .command('deployments')
    .description('Show the deployment history of an application')
    .argument('<app>', 'Application name')
    .action(async (appName: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Fetching deployments…').start();
      try {
        const deployments = await listDeploymentsUseCase(appName);
        spinner.stop();
        printDeploymentsTable(deployments);
      } catch (err) {
        spinner.fail('Failed to fetch deployments.');
        handleError(err);
      }
    });
}
