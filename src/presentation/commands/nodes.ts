import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireRole } from '../../application/usecases/requireRole';
import { listMachinesUseCase } from '../../application/usecases/ListMachinesUseCase';
import { getMachineUseCase } from '../../application/usecases/GetMachineUseCase';
import { claimMachineUseCase } from '../../application/usecases/ClaimMachineUseCase';
import {
  configureMachineResourcesUseCase,
  MachineResourceLimitsInput,
} from '../../application/usecases/ConfigureMachineResourcesUseCase';
import { printMachineTable, printMachineDetail } from '../formatting/table';
import { formatSharedLimits } from '../formatting/sharedLimits';
import { handleError } from '../formatting/errors';

interface ConfigureOptions {
  vcpu?: string;
  memoryMb?: string;
  storageMb?: string;
  clear?: boolean;
}

function fail(message: string): never {
  console.error(chalk.red('Error:'), message);
  process.exit(1);
}

function parseLimit(raw: string | undefined, flag: string, integer: boolean): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    fail(`${flag} must be a ${integer ? 'positive integer' : 'number greater than 0'} (got "${raw}").`);
  }
  return value;
}

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

  node
    .command('configure <id>')
    .description('Set how much CPU, memory and storage a node shares with applications')
    .option('--vcpu <n>', 'vCPU limit to share (accepts decimals, e.g. 2.5)')
    .option('--memory-mb <n>', 'memory limit to share, in MB')
    .option('--storage-mb <n>', 'storage limit to share, in MB')
    .option('--clear', 'remove all configured resource limits')
    .action(async (id: string, options: ConfigureOptions) => {
      requireRole(['provider', 'admin']);

      const hasLimitFlag =
        options.vcpu !== undefined || options.memoryMb !== undefined || options.storageMb !== undefined;
      if (options.clear && hasLimitFlag) {
        fail('--clear cannot be combined with --vcpu, --memory-mb or --storage-mb.');
      }
      if (!options.clear && !hasLimitFlag) {
        fail('Provide at least one of --vcpu, --memory-mb, --storage-mb, or use --clear.');
      }

      const limits: MachineResourceLimitsInput = options.clear
        ? { sharedVCpu: null, sharedMemoryMb: null, sharedStorageMb: null }
        : {
            sharedVCpu: parseLimit(options.vcpu, '--vcpu', false),
            sharedMemoryMb: parseLimit(options.memoryMb, '--memory-mb', true),
            sharedStorageMb: parseLimit(options.storageMb, '--storage-mb', true),
          };

      const spinner = ora('Updating node limits…').start();
      try {
        const machine = await configureMachineResourcesUseCase(id, limits);
        spinner.succeed(chalk.green(`Node limits updated: ${chalk.bold(machine.name)}`));
        console.log(`ID:     ${machine.id}`);
        console.log(`Shared: ${formatSharedLimits(machine)}`);
      } catch (err) {
        spinner.fail('Failed to update node limits.');
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
