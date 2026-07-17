import { Command, InvalidArgumentError } from 'commander';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { deployApplicationUseCase, DeployResult } from '../../application/usecases/DeployApplicationUseCase';
import { deployManifestUseCase } from '../../application/usecases/DeployManifestUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { loadManifestFile } from '../../application/manifest/loadManifestFile';
import { normalizePlacement } from '../../application/placement';
import { ManifestPlacement } from '../../domain/entities/types';
import { handleError } from '../formatting/errors';

interface DeployOptions {
  name?: string;
  appId?: string;
  port?: number;
  env: string[];
  country?: string;
  region?: string;
}

export function registerDeployCommand(program: Command): void {
  program
    .command('deploy [image]')
    .description('Deploy an app: with no image, reads zs.yaml; with an image, a single container')
    .option('-n, --name <name>', 'Application name (single-image; defaults to image name or zs.yaml app name)')
    .option('--app-id <id>', 'Deploy to a specific application id (skips lookup/create; pin after the first deploy)')
    .option('-p, --port <port>', 'Container port to expose (single-image)', parseInt)
    .option('-e, --env <KEY=VALUE>', 'Environment variable, repeatable (single-image)', collect, [])
    .option('--country <cc>', 'Preferred node country, ISO 3166-1 alpha-2 (e.g. BR); overrides zs.yaml placement.country', parseCountry)
    .option('--region <rc>', 'Preferred node region/state code (e.g. RS); overrides zs.yaml placement.region', parseRegion)
    .addHelpText('after', `
Placement (soft preference):
  The deploy asks for a node in the given country/region; when no node matches,
  the backend falls back to any eligible node. In zs.yaml mode the preference is
  read from the top-level "placement:" section and the flags override it.

Examples:
  $ zs deploy ghcr.io/me/api:1.0 --country BR --region RS
  $ zs deploy --country BR
  $ cat zs.yaml
    app: my-app
    placement:
      country: BR
      region: RS
    services:
      - name: api
        image: ghcr.io/me/api:1.0
        exposed: true`)
    .action(async (image: string | undefined, opts: DeployOptions) => {
      requireRole(['developer', 'admin']);

      if (image) {
        await runSingleImage(image, opts);
      } else {
        await runManifest(opts);
      }
    });
}

async function runSingleImage(image: string, opts: DeployOptions): Promise<void> {
  const spinner = ora(`Deploying ${chalk.cyan(image)}…`).start();
  try {
    const name = opts.name ?? manifestAppName(process.cwd());
    const result = await deployApplicationUseCase(
      { image, name, appId: opts.appId, port: opts.port, env: opts.env, country: opts.country, region: opts.region },
      (status) => { spinner.text = `Status: ${chalk.yellow(status)}…`; },
    );
    reportResult(spinner, result, name, normalizePlacement({ country: opts.country, region: opts.region }));
  } catch (err) {
    spinner.fail('Deploy failed.');
    handleError(err);
  }
}

function manifestAppName(dir: string): string | undefined {
  try {
    return loadManifestFile(dir).app;
  } catch {
    return undefined;
  }
}

async function runManifest(opts: DeployOptions): Promise<void> {
  const spinner = ora('Reading zs.yaml…').start();
  try {
    const result = await deployManifestUseCase(
      process.cwd(),
      (status) => { spinner.text = `Status: ${chalk.yellow(status)}…`; },
      { placement: { country: opts.country, region: opts.region } },
    );
    reportResult(spinner, result, result.manifest.app, result.placement);
  } catch (err) {
    spinner.fail('Deploy failed.');
    handleError(err);
  }
}

function reportResult(spinner: Ora, { instance, timedOut }: DeployResult, appName?: string, placement?: ManifestPlacement): void {
  if (timedOut) {
    spinner.warn(chalk.yellow('Deploy timed out waiting for RUNNING status.'));
    console.log(`Instance ID: ${chalk.bold(instance.id)}`);
    console.log(`Last status: ${instance.status}`);
    console.log(chalk.gray('Check "zs list" for updates.'));
    return;
  }

  if (instance.status === 'RUNNING') {
    spinner.succeed(chalk.green(appName ? `Deploy successful: ${appName}` : 'Deploy successful!'));
    console.log(`Instance ID: ${chalk.bold(instance.id)}`);
    const appAddress = instance.application?.address ?? instance.application?.publicUrl ?? instance.address;
    if (appAddress) {
      console.log(`Address:     ${chalk.underline.cyan(appAddress)}`);
    }
    if (placement) {
      console.log(`Placement:   ${chalk.cyan(formatPlacement(placement))} ${chalk.gray('(preferred)')}`);
    }
  } else {
    spinner.fail(chalk.red(`Deploy ended with status: ${instance.status}`));
    console.log(`Instance ID: ${chalk.bold(instance.id)}`);
    console.log(chalk.gray('Run "zs logs <instance-id>" for details.'));
  }
}

function formatPlacement(placement: ManifestPlacement): string {
  return [placement.country, placement.region].filter(Boolean).join('/');
}

function parseCountry(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new InvalidArgumentError('must be a 2-letter ISO 3166-1 alpha-2 code (e.g. BR)');
  }
  return normalized;
}

function parseRegion(value: string): string {
  return value.trim().toUpperCase();
}

function collect(val: string, prev: string[]): string[] {
  return [...prev, val];
}
