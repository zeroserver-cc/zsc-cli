import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireRole } from '../../application/usecases/requireRole';
import {
  domainAddUseCase,
  domainListUseCase,
  domainVerifyUseCase,
  domainRemoveUseCase,
} from '../../application/usecases/DomainUseCase';
import { handleError } from '../formatting/errors';
import { prompt } from '../io/prompt';
import { CustomDomain, CustomDomainStatus } from '../../domain/entities/types';

function statusLabel(status: CustomDomainStatus): string {
  switch (status) {
    case 'ACTIVE':
      return chalk.green(status);
    case 'VERIFIED':
      return chalk.cyan(status);
    case 'FAILED':
      return chalk.red(status);
    default:
      return chalk.yellow(status);
  }
}

function printDnsInstructions(record: CustomDomain): void {
  if (!record.dnsInstructions.length) return;
  console.log(chalk.bold('\nCreate these DNS records at your domain provider:'));
  for (const ins of record.dnsInstructions) {
    console.log(`  ${chalk.bold(ins.recordType.padEnd(5))} ${ins.name}  ${chalk.gray('→')}  ${ins.value}`);
  }
  const hasRouting = record.dnsInstructions.some((i) => i.recordType !== 'TXT');
  if (!hasRouting) {
    console.log(chalk.gray('  (routing record appears here once the application has a running instance)'));
  }
}

export function registerDomainCommands(program: Command): void {
  const domain = program
    .command('domain')
    .description('Attach your own domains to an application');

  domain
    .command('add <domain>')
    .description('Claim a domain for an application and get the DNS records to create')
    .requiredOption('--app <name>', 'Application name the domain routes to')
    .action(async (domainName: string, opts: { app: string }) => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Claiming domain…').start();
      try {
        const record = await domainAddUseCase(domainName, opts.app);
        spinner.succeed(
          `Domain ${chalk.bold(record.domain)} claimed for app ${chalk.bold(opts.app)} (status ${statusLabel(record.status)}).`,
        );
        printDnsInstructions(record);
        console.log(chalk.gray(`\nAfter creating the records, run "zs domain verify ${record.domain}".`));
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });

  domain
    .command('list')
    .alias('ls')
    .description('List your custom domains and their status')
    .option('--app <name>', 'Only domains of this application')
    .action(async (opts: { app?: string }) => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Fetching domains…').start();
      try {
        const domains = await domainListUseCase(opts.app);
        spinner.stop();
        if (!domains.length) {
          console.log(chalk.yellow('No custom domains. Add one with "zs domain add <domain> --app <name>".'));
          return;
        }
        for (const d of domains) {
          console.log(`${chalk.bold(d.domain)}  ${statusLabel(d.status)}`);
        }
        if (domains.some((d) => d.status === 'PENDING')) {
          console.log(chalk.gray('\nPending domains need their DNS records; check "zs domain verify <domain>".'));
        }
      } catch (err) {
        spinner.fail('Failed to fetch domains.');
        handleError(err);
      }
    });

  domain
    .command('verify <domain>')
    .description('Check the DNS TXT proof and activate the domain')
    .action(async (domainName: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Checking DNS…').start();
      try {
        const record = await domainVerifyUseCase(domainName);
        if (record.status === 'ACTIVE' || record.status === 'VERIFIED') {
          spinner.succeed(`Domain ${chalk.bold(record.domain)} verified (status ${statusLabel(record.status)}).`);
          console.log(chalk.gray('It may take a moment for the route and the TLS certificate to go live.'));
        } else {
          spinner.warn(`Domain ${chalk.bold(record.domain)} is still ${statusLabel(record.status)}.`);
          printDnsInstructions(record);
          console.log(
            chalk.gray('\nDNS changes can take minutes to hours to propagate. Try again in a little while.'),
          );
        }
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });

  domain
    .command('remove <domain>')
    .alias('rm')
    .description('Detach a domain from its application and stop routing it')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (domainName: string, opts: { yes?: boolean }) => {
      requireRole(['developer', 'admin']);
      try {
        if (!opts.yes) {
          const answer = await prompt(`Remove ${domainName}? Traffic to it will stop being routed. [y/N] `);
          if (answer.trim().toLowerCase() !== 'y') {
            console.log('Aborted.');
            return;
          }
        }
        const spinner = ora('Removing domain…').start();
        const removed = await domainRemoveUseCase(domainName);
        if (removed) {
          spinner.succeed(`Domain ${chalk.bold(domainName)} removed.`);
        } else {
          spinner.warn(`Domain ${domainName} was not removed.`);
        }
      } catch (err) {
        handleError(err);
      }
    });
}
