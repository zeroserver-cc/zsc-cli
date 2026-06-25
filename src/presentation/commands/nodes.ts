import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireRole } from '../../application/usecases/requireRole';
import { listMachinesUseCase } from '../../application/usecases/ListMachinesUseCase';
import { getMachineUseCase } from '../../application/usecases/GetMachineUseCase';
import { claimMachineUseCase } from '../../application/usecases/ClaimMachineUseCase';
import { printMachineTable, printMachineDetail } from '../formatting/table';
import { handleError } from '../formatting/errors';

export function registerNodeCommands(program: Command): void {
  const node = program
    .command('node')
    .description('Manage provider nodes');

  node
    .command('list')
    .alias('ls')
    .description('List all your registered nodes')
    .action(async () => {
      requireRole(['provider', 'admin']);
      const spinner = ora('Fetching nodes…').start();
      try {
        const rows = await listMachinesUseCase();
        spinner.stop();
        printMachineTable(rows);
      } catch (err) {
        spinner.fail('Failed to fetch nodes.');
        handleError(err);
      }
    });

  node
    .command('status <id>')
    .description('Show status and running applications for a node')
    .action(async (id: string) => {
      requireRole(['provider', 'admin']);
      const spinner = ora('Fetching node details…').start();
      try {
        const detail = await getMachineUseCase(id);
        spinner.stop();
        printMachineDetail(detail);
      } catch (err) {
        spinner.fail('Failed to fetch node.');
        handleError(err);
      }
    });

  node
    .command('claim <token>')
    .description('Claim a node using its agent registration token')
    .action(async (token: string) => {
      requireRole(['provider', 'admin']);
      const spinner = ora('Claiming node…').start();
      try {
        const machine = await claimMachineUseCase(token);
        spinner.succeed(chalk.green(`Node claimed: ${chalk.bold(machine.name)}`));
        console.log(`ID:     ${machine.id}`);
        console.log(`Status: ${machine.status}`);
      } catch (err) {
        spinner.fail('Failed to claim node.');
        handleError(err);
      }
    });

  // top-level alias for discoverability
  program
    .command('nodes')
    .description('List all your registered nodes (alias for "node list")')
    .action(async () => {
      requireRole(['provider', 'admin']);
      const spinner = ora('Fetching nodes…').start();
      try {
        const rows = await listMachinesUseCase();
        spinner.stop();
        printMachineTable(rows);
      } catch (err) {
        spinner.fail('Failed to fetch nodes.');
        handleError(err);
      }
    });
}
