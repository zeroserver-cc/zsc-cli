import Table from 'cli-table3';
import chalk from 'chalk';
import { AppRow } from '../../application/usecases/ListApplicationsUseCase';
import { MachineRow } from '../../application/usecases/ListMachinesUseCase';
import { MachineDetail } from '../../application/usecases/GetMachineUseCase';
import { parseDate } from './dates';
import { formatSharedLimitValue } from './sharedLimits';

const STATUS_COLORS: Record<string, (s: string) => string> = {
  RUNNING: chalk.green,
  STARTING: chalk.yellow,
  PENDING: chalk.yellow,
  STOPPED: chalk.gray,
  STOPPING: chalk.gray,
  ERROR: chalk.red,
  FAILED: chalk.red,
};

function colorStatus(status: string): string {
  const colorFn = STATUS_COLORS[status] ?? ((s: string) => s);
  return colorFn(status);
}

export function printAppTable(rows: AppRow[]): void {
  if (!rows.length) {
    console.log(chalk.gray('No deployments found.'));
    return;
  }

  const table = new Table({
    head: ['Instance ID', 'App', 'Image', 'Status', 'Address'].map((h) => chalk.bold(h)),
    style: { head: [], border: [] },
  });

  for (const row of rows) {
    table.push([
      chalk.dim(row.instanceId.slice(0, 8) + '…'),
      row.appName,
      chalk.cyan(row.image),
      colorStatus(row.status),
      row.address !== '-' ? chalk.underline(row.address) : chalk.gray('-'),
    ]);
  }

  console.log(table.toString());
}

const MACHINE_STATUS_COLORS: Record<string, (s: string) => string> = {
  ONLINE:      chalk.green,
  IDLE:        chalk.cyan,
  BUSY:        chalk.yellow,
  OVERLOADED:  chalk.red,
  REGISTERING: chalk.yellow,
  OFFLINE:     chalk.gray,
};

function colorMachineStatus(status: string): string {
  const fn = MACHINE_STATUS_COLORS[status] ?? ((s: string) => s);
  return fn(status);
}

export function printMachineTable(rows: MachineRow[]): void {
  if (!rows.length) {
    console.log(chalk.gray('No nodes found. Use "zs node claim <token>" to add one.'));
    return;
  }

  const table = new Table({
    head: ['Node ID', 'Name', 'Status', 'CPU', 'Memory', 'OS', 'Agent', 'Shared', 'Last Seen'].map((h) => chalk.bold(h)),
    style: { head: [], border: [] },
  });

  for (const row of rows) {
    table.push([
      chalk.dim(row.id.slice(0, 8) + '…'),
      row.name,
      colorMachineStatus(row.status),
      chalk.dim(row.cpu),
      chalk.dim(row.memoryGb),
      chalk.dim(row.os),
      chalk.dim(row.agentVersion),
      row.shared === '—' ? chalk.gray(row.shared) : row.shared,
      row.lastSeen,
    ]);
  }

  console.log(table.toString());
}

export function printMachineDetail({ machine, instances }: MachineDetail): void {
  console.log('');
  console.log(`${chalk.bold('Node:')}   ${machine.name}  ${colorMachineStatus(machine.status)}`);
  console.log(`${chalk.bold('ID:')}     ${machine.id}`);

  if (machine.specs) {
    const { cpu, memory, storage, os } = machine.specs;
    console.log(`${chalk.bold('CPU:')}    ${cpu.cores} cores – ${cpu.model}${cpu.frequency ? ` @ ${cpu.frequency}` : ''}`);
    console.log(`${chalk.bold('Memory:')} ${Math.round(memory.available / 1024)}/${Math.round(memory.total / 1024)} GB available`);
    console.log(`${chalk.bold('Disk:')}   ${Math.round(storage.available / 1024)}/${Math.round(storage.total / 1024)} GB available`);
    console.log(`${chalk.bold('OS:')}     ${os.name} ${os.version} (${os.architecture})`);
  }

  console.log(`${chalk.bold('Agent:')}  ${machine.agentVersion || '-'}`);

  console.log(chalk.bold('Shared limits:'));
  console.log(`  vCPU:    ${formatSharedLimitValue(machine.sharedVCpu, 'vCPU')}`);
  console.log(`  Memory:  ${formatSharedLimitValue(machine.sharedMemoryMb, 'MB')}`);
  console.log(`  Storage: ${formatSharedLimitValue(machine.sharedStorageMb, 'MB')}`);

  if (machine.lastHeartbeat) {
    const hbDate = parseDate(machine.lastHeartbeat);
    const hbStr = isNaN(hbDate.getTime())
      ? machine.lastHeartbeat
      : hbDate.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    console.log(`${chalk.bold('Heartbeat:')} ${hbStr}`);
  }

  console.log('');

  if (!instances.length) {
    console.log(chalk.gray('No applications running on this node.'));
    return;
  }

  console.log(chalk.bold('Running applications:'));
  const table = new Table({
    head: ['Instance ID', 'App', 'Image', 'Status', 'Address'].map((h) => chalk.bold(h)),
    style: { head: [], border: [] },
  });

  for (const inst of instances) {
    table.push([
      chalk.dim(inst.id.slice(0, 8) + '…'),
      inst.application?.name ?? '-',
      chalk.cyan(inst.application?.dockerImage ?? '-'),
      colorStatus(inst.status),
      inst.address ? chalk.underline(inst.address) : chalk.gray('-'),
    ]);
  }

  console.log(table.toString());
}
