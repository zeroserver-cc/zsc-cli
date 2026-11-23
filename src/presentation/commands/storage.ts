import { Command, InvalidArgumentError } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  createStorageKeyUseCase,
  createStorageUseCase,
  deleteStorageUseCase,
  findAccessKey,
  getStorageUsageUseCase,
  isLastActiveKey,
  listStoragesUseCase,
  resolveStorageUseCase,
  revokeStorageKeyUseCase
} from '../../application/usecases/ManagedStorageUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import {
  ManagedStorage,
  ManagedStorageCreatedAccessKey,
  ManagedStorageStatus
} from '../../domain/entities/types';
import { handleError } from '../formatting/errors';
import {
  credentialsBlock,
  egressSummary,
  envExample,
  monitoringNotice,
  quotaNotice,
  replicationSummary,
  storedSummary
} from '../formatting/storage';
import { prompt } from '../io/prompt';

const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/;

function parseName(value: string): string {
  if (!NAME_PATTERN.test(value)) {
    throw new InvalidArgumentError(
      'must be a lowercase DNS label of 3 to 40 characters (a-z, 0-9, hyphen; not starting or ending with a hyphen)'
    );
  }
  return value;
}

function parseGb(value: string): number {
  const gb = Number(value);
  if (!Number.isInteger(gb) || gb < 1) {
    throw new InvalidArgumentError('must be a positive integer (GB)');
  }
  return gb;
}

function statusLabel(status: ManagedStorageStatus): string {
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

function printQuotaNotices(storage: ManagedStorage): void {
  const notice = quotaNotice(storage);
  if (notice) console.log(chalk.red(notice));
  const monitoring = monitoringNotice(storage.usage);
  if (monitoring) console.log(chalk.yellow(monitoring));
}

function printSecretOnce(storage: ManagedStorage, key: ManagedStorageCreatedAccessKey): void {
  for (const line of credentialsBlock(storage, key)) console.log(line);
  console.log(
    chalk.yellow(
      'Save the secret access key now: it is shown only once and cannot be retrieved again. ' +
        'If you lose it, create a new key and revoke this one.'
    )
  );
  console.log('');
  console.log('Use it with any S3 client (path-style):');
  for (const line of envExample(storage, key)) console.log(chalk.gray(`  ${line}`));
}

async function confirm(question: string, skip?: boolean): Promise<boolean> {
  if (skip) return true;
  const answer = await prompt(question);
  if (answer.trim().toLowerCase() === 'y') return true;
  console.log('Aborted.');
  return false;
}

function registerKeyCommands(storage: Command): void {
  const keys = storage.command('keys').description('Manage the access keys of a storage instance');

  keys
    .command('list <name-or-id>')
    .alias('ls')
    .description('List access keys, including revoked ones (secrets are never shown)')
    .action(async (target: string) => {
      requireRole(['developer', 'admin']);
      try {
        const instance = await resolveStorageUseCase(target);
        const table = new Table({
          head: ['Key ID', 'Access key ID', 'Label', 'Status', 'Created']
        });
        for (const key of instance.accessKeys) {
          table.push([
            key.id,
            key.accessKeyId,
            key.label || '-',
            key.status === 'ACTIVE' ? chalk.green(key.status) : chalk.gray(key.status),
            new Date(key.createdAt).toLocaleString()
          ]);
        }
        console.log(table.toString());
      } catch (err) {
        handleError(err);
      }
    });

  keys
    .command('create <name-or-id>')
    .description('Issue one more access key pair (the secret is shown once)')
    .option('--label <label>', 'Label to recognize the key later')
    .action(async (target: string, opts: { label?: string }) => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Creating access key…').start();
      try {
        const { storage: instance, accessKey } = await createStorageKeyUseCase(target, opts.label);
        spinner.succeed(`Access key created on ${chalk.bold(instance.name)}.`);
        printSecretOnce(instance, accessKey);
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });

  keys
    .command('revoke <name-or-id> <key-id>')
    .description('Revoke an access key (the engine rejects it within seconds)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (target: string, keyRef: string, opts: { yes?: boolean }) => {
      requireRole(['developer', 'admin']);
      let spinner: ReturnType<typeof ora> | undefined;
      try {
        const instance = await resolveStorageUseCase(target);
        const key = findAccessKey(instance, keyRef);
        const last = isLastActiveKey(instance, key);
        const warning = last
          ? `This is the LAST active key of ${instance.name}: the storage will stop serving requests until you create a new key. `
          : '';
        const proceed = await confirm(
          `Revoke key ${key.accessKeyId} (${key.label || 'no label'})? ${warning}Clients using it lose access. [y/N] `,
          opts.yes
        );
        if (!proceed) return;
        spinner = ora(`Revoking ${chalk.cyan(key.accessKeyId)}…`).start();
        await revokeStorageKeyUseCase(instance, key);
        spinner.succeed(`Key ${key.accessKeyId} revoked.`);
        if (last) {
          console.log(
            chalk.yellow(
              `Create a new key with "zs storage keys create ${instance.name}" to use the storage again.`
            )
          );
        }
      } catch (err) {
        spinner?.stop();
        handleError(err);
      }
    });
}

export function registerStorageCommands(program: Command): void {
  const storage = program
    .command('storage')
    .description('Manage platform-provisioned S3-compatible object storage');

  storage
    .command('create <name>')
    .description('Provision an object storage instance (https://<name>.s3.zeroserver.cc)')
    .option('--quota-gb <gb>', 'Storage limit in GB (platform default applies)', parseGb)
    .option('--egress-quota-gb <gb>', 'Monthly outbound transfer limit in GB', parseGb)
    .action(async (name: string, opts: { quotaGb?: number; egressQuotaGb?: number }) => {
      requireRole(['developer', 'admin']);
      try {
        parseName(name);
      } catch (err) {
        handleError(err);
      }
      const spinner = ora(`Creating object storage ${chalk.cyan(name)}…`).start();
      try {
        const { storage: instance, accessKey } = await createStorageUseCase(
          name,
          opts.quotaGb,
          opts.egressQuotaGb
        );
        spinner.succeed(
          `Storage ${chalk.bold(instance.name)} created (status ${statusLabel(instance.status)}).`
        );
        printSecretOnce(instance, accessKey);
        console.log(
          chalk.gray(
            'Usage is metered; there is no charge during the beta. The provider can read stored data: encrypt sensitive data client-side.'
          )
        );
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });

  storage
    .command('list')
    .alias('ls')
    .description('List your object storage instances')
    .action(async () => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Fetching storage instances…').start();
      try {
        const storages = await listStoragesUseCase();
        spinner.stop();
        if (storages.length === 0) {
          console.log(
            chalk.yellow('No object storage. Create one with "zs storage create <name>".')
          );
          return;
        }
        const table = new Table({
          head: ['Name', 'Status', 'Stored', 'Egress', 'Writes', 'Endpoint']
        });
        for (const item of storages) {
          table.push([
            item.name,
            statusLabel(item.status),
            storedSummary(item),
            egressSummary(item),
            item.quotaExceeded ? chalk.red('blocked') : 'open',
            item.endpoint
          ]);
        }
        console.log(table.toString());
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });

  storage
    .command('info <name-or-id>')
    .description('Show status, quota, usage, standby copy and access keys of an instance')
    .action(async (target: string) => {
      requireRole(['developer', 'admin']);
      try {
        const item = await resolveStorageUseCase(target);
        const activeKeys = item.accessKeys.filter((key) => key.status === 'ACTIVE').length;
        console.log(`Name:      ${chalk.bold(item.name)}`);
        console.log(`ID:        ${item.id}`);
        console.log(`Status:    ${statusLabel(item.status)}`);
        console.log(`Endpoint:  ${item.endpoint} (path-style)`);
        console.log(`Region:    ${item.region}`);
        console.log(`Stored:    ${storedSummary(item)}`);
        console.log(`Egress:    ${egressSummary(item)}`);
        console.log(`Writes:    ${item.quotaExceeded ? chalk.red('blocked') : 'open'}`);
        console.log(`Standby:   ${replicationSummary(item.replication)}`);
        console.log(
          `Keys:      ${activeKeys} active, ${item.accessKeys.length - activeKeys} revoked`
        );
        printQuotaNotices(item);
      } catch (err) {
        handleError(err);
      }
    });

  storage
    .command('usage <name-or-id>')
    .description('Show the metered usage of the current month (no charge during the beta)')
    .action(async (target: string) => {
      requireRole(['developer', 'admin']);
      try {
        const { storage: item, usage } = await getStorageUsageUseCase(target);
        console.log(
          `${chalk.bold(item.name)}: ${usage.storageGbHours.toFixed(2)} GB-hours stored, ` +
            `${usage.egressGb.toFixed(2)} GB sent, over ${usage.measuredHours} measured hours.`
        );
        const table = new Table({ head: ['Day (UTC)', 'GB-hours', 'Avg stored GB', 'Egress GB'] });
        for (const day of usage.days) {
          table.push([
            day.day.slice(0, 10),
            day.storageGbHours.toFixed(2),
            day.avgStoredGb === null || day.avgStoredGb === undefined
              ? '-'
              : day.avgStoredGb.toFixed(2),
            day.egressGb.toFixed(2)
          ]);
        }
        console.log(table.toString());
        console.log(
          chalk.gray(
            'Usage is measured, not billed: there is no charge during the beta. Hours without a report are gaps, not zeros.'
          )
        );
      } catch (err) {
        handleError(err);
      }
    });

  storage
    .command('delete <name-or-id>')
    .alias('rm')
    .description('Delete an instance: its keys are revoked and the data is removed')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (target: string, opts: { yes?: boolean }) => {
      requireRole(['developer', 'admin']);
      let spinner: ReturnType<typeof ora> | undefined;
      try {
        const proceed = await confirm(
          `Delete storage ${target}? All buckets and objects will be permanently removed and the keys revoked. [y/N] `,
          opts.yes
        );
        if (!proceed) return;
        spinner = ora(`Deleting storage ${chalk.cyan(target)}…`).start();
        const { storage: item, deleted } = await deleteStorageUseCase(target);
        if (deleted) {
          spinner.succeed(`Storage ${chalk.bold(item.name)} is being deleted.`);
        } else {
          spinner.warn(`Storage ${item.name} was not deleted.`);
        }
      } catch (err) {
        spinner?.stop();
        handleError(err);
      }
    });

  registerKeyCommands(storage);
}
