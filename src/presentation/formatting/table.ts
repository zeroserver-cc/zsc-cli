import Table from 'cli-table3';
import chalk from 'chalk';
import { AppRow } from '../../application/usecases/ListApplicationsUseCase';

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
