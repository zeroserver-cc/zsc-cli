import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { listVolumesUseCase } from '../../application/usecases/ListVolumesUseCase';
import { restoreVolumesUseCase } from '../../application/usecases/RestoreVolumesUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { handleError } from '../formatting/errors';

export function registerVolumeCommand(program: Command): void {
  const volume = program
    .command('volume')
    .description('Manage persistent volumes of an application');

  volume
    .command('ls <application-id>')
    .description('List persistent volumes of an application')
    .action(async (applicationId: string) => {
      requireRole(['developer', 'admin']);

      const spinner = ora('Loading volumes…').start();
      try {
        const rows = await listVolumesUseCase(applicationId);
        spinner.stop();

        if (rows.length === 0) {
          console.log(chalk.yellow('No persistent volumes found for this application.'));
          return;
        }

        const table = new Table({
          head: ['Name', 'Service', 'Mount Path', 'Node', 'Last Snapshot'],
        });
        for (const row of rows) {
          table.push([row.name, row.serviceName, row.mountPath, row.nodeId, row.lastSnapshot]);
        }
        console.log(table.toString());
      } catch (err) {
        spinner.fail('Failed to load volumes.');
        handleError(err);
      }
    });

  volume
    .command('restore <application-id>')
    .description('Restore persistent volumes of an application from the latest S3 snapshot')
    .action(async (applicationId: string) => {
      requireRole(['developer', 'admin']);

      const spinner = ora('Requesting volume restore…').start();
      try {
        const result = await restoreVolumesUseCase(applicationId);
        spinner.succeed(
          `Restore queued on node ${chalk.cyan(result.targetMachineId)} with ${result.commandIds.length} command(s).`
        );
      } catch (err) {
        spinner.fail('Failed to queue volume restore.');
        handleError(err);
      }
    });
}
