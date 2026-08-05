import { Command, InvalidArgumentError } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  createDatabaseUseCase,
  deleteDatabaseUseCase,
  getConnectionStringUseCase,
  listDatabasesUseCase,
  restoreDatabaseUseCase,
} from '../../application/usecases/ManagedDatabaseUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { ManagedDatabaseEngine, ManagedDatabaseStatus } from '../../domain/entities/types';
import { handleError } from '../formatting/errors';
import { replicaSummary } from '../formatting/replicas';
import { prompt } from '../io/prompt';

function parseEngine(value: string): ManagedDatabaseEngine {
  const normalized = value.trim().toUpperCase();
  if (normalized !== 'POSTGRES' && normalized !== 'MYSQL') {
    throw new InvalidArgumentError('must be "postgres" or "mysql"');
  }
  return normalized;
}

function parseReplicas(value: string): number {
  const replicas = Number(value);
  if (!Number.isInteger(replicas) || replicas < 0 || replicas > 2) {
    throw new InvalidArgumentError('must be 0, 1 or 2');
  }
  return replicas;
}

function statusLabel(status: ManagedDatabaseStatus): string {
  switch (status) {
    case 'RUNNING':
      return chalk.green(status);
    case 'ERROR':
      return chalk.red(status);
    case 'DELETING':
    case 'DELETED':
      return chalk.gray(status);
    default:
      return chalk.yellow(status);
  }
}

export function registerDatabaseCommands(program: Command): void {
  const db = program
    .command('db')
    .description('Manage platform-provisioned databases (PostgreSQL/MySQL)');

  db.command('create')
    .description('Provision a managed database')
    .requiredOption('--engine <engine>', 'Database engine: postgres or mysql', parseEngine)
    .requiredOption('--name <name>', 'Database name (DNS-safe; apps attach to it by this name)')
    .option(
      '--replicas <count>',
      'Read replicas on other nodes for automatic failover (0-2; backend default is 1; 0 = single-node, no HA)',
      parseReplicas,
    )
    .action(async (opts: { engine: ManagedDatabaseEngine; name: string; replicas?: number }) => {
      requireRole(['developer', 'admin']);
      const spinner = ora(`Creating ${opts.engine.toLowerCase()} database ${chalk.cyan(opts.name)}…`).start();
      try {
        const database = await createDatabaseUseCase(opts.name, opts.engine, opts.replicas);
        spinner.succeed(`Database ${chalk.bold(database.name)} created (status ${statusLabel(database.status)}).`);
        console.log(`ID:      ${chalk.bold(database.id)}`);
        console.log(`Replicas: ${replicaSummary(database.replicas)}`);
        console.log(
          chalk.gray(
            `Attach an app by adding "database: ${database.name}" to its zs.yaml and redeploying, ` +
              `or read the credentials with "zs db connection ${database.name}".`,
          ),
        );
      } catch (err) {
        spinner.fail('Failed to create the database.');
        handleError(err);
      }
    });

  db.command('list')
    .alias('ls')
    .description('List your managed databases')
    .action(async () => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Fetching databases…').start();
      try {
        const databases = await listDatabasesUseCase();
        spinner.stop();
        if (databases.length === 0) {
          console.log(chalk.yellow('No managed databases. Create one with "zs db create --engine postgres --name <name>".'));
          return;
        }
        const table = new Table({
          head: ['Name', 'Engine', 'Status', 'Replicas', 'Node', 'Last Dump'],
        });
        for (const database of databases) {
          table.push([
            database.name,
            database.engine,
            statusLabel(database.status),
            replicaSummary(database.replicas),
            database.machineId ?? '-',
            database.lastDumpAt ? new Date(database.lastDumpAt).toLocaleString() : '-',
          ]);
        }
        console.log(table.toString());
      } catch (err) {
        spinner.fail('Failed to fetch databases.');
        handleError(err);
      }
    });

  db.command('connection <name-or-id>')
    .description('Print the connection string (DATABASE_URL) of a managed database')
    .action(async (target: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Fetching connection string…').start();
      try {
        const { database, url } = await getConnectionStringUseCase(target);
        spinner.stop();
        console.log(url);
        console.log(chalk.yellow('This URL contains credentials. Treat it as a secret: do not commit it or share it.'));
        console.log(
          chalk.gray(`Apps attached via "database: ${database.name}" in zs.yaml receive it automatically as DATABASE_URL.`),
        );
        if (database.replicas.some((replica) => replica.role === 'REPLICA' && replica.status === 'STREAMING')) {
          console.log(
            chalk.gray(
              'This database has a streaming read replica: attached apps also receive DATABASE_READ_URL, ' +
                'pointing at the replica when one shares the app node (it falls back to the primary otherwise).',
            ),
          );
        }
      } catch (err) {
        spinner.fail('Failed to fetch the connection string.');
        handleError(err);
      }
    });

  db.command('delete <name-or-id>')
    .alias('rm')
    .description('Delete a managed database: takes a final dump and tears down the container')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (target: string, opts: { yes?: boolean }) => {
      requireRole(['developer', 'admin']);
      let spinner: ReturnType<typeof ora> | undefined;
      try {
        if (!opts.yes) {
          const answer = await prompt(
            `Delete database ${target}? This is destructive: a final dump is taken and the container is torn down. [y/N] `,
          );
          if (answer.trim().toLowerCase() !== 'y') {
            console.log('Aborted.');
            return;
          }
        }
        spinner = ora(`Deleting database ${chalk.cyan(target)}…`).start();
        const { database, deleted } = await deleteDatabaseUseCase(target);
        if (deleted) {
          spinner.succeed(`Database ${chalk.bold(database.name)} deleted.`);
        } else {
          spinner.warn(`Database ${database.name} was not deleted.`);
        }
      } catch (err) {
        // handleError exits the process; stop the spinner first or it keeps
        // animating over the error output.
        spinner?.stop();
        handleError(err);
      }
    });

  db.command('restore <name-or-id>')
    .description('Restore the latest successful dump into the database, overwriting current data')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (target: string, opts: { yes?: boolean }) => {
      requireRole(['developer', 'admin']);
      let spinner: ReturnType<typeof ora> | undefined;
      try {
        if (!opts.yes) {
          const answer = await prompt(
            `Restore database ${target} from the latest dump? Current data will be overwritten. [y/N] `,
          );
          if (answer.trim().toLowerCase() !== 'y') {
            console.log('Aborted.');
            return;
          }
        }
        spinner = ora(`Restoring database ${chalk.cyan(target)}…`).start();
        const { database, restored } = await restoreDatabaseUseCase(target);
        if (restored) {
          spinner.succeed(`Database ${chalk.bold(database.name)} restored from the latest dump.`);
        } else {
          spinner.warn(`Database ${database.name} was not restored.`);
        }
      } catch (err) {
        spinner?.stop();
        handleError(err);
      }
    });
}
