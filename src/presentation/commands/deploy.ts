import { Command } from 'commander';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { deployApplicationUseCase, DeployResult } from '../../application/usecases/DeployApplicationUseCase';
import { deployManifestUseCase } from '../../application/usecases/DeployManifestUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { handleError } from '../formatting/errors';

export function registerDeployCommand(program: Command): void {
  program
    .command('deploy [image]')
    .description('Deploy an app: with no image, reads zs.yaml; with an image, a single container')
    .option('-n, --name <name>', 'Application name (single-image; defaults to image name)')
    .option('-p, --port <port>', 'Container port to expose (single-image)', parseInt)
    .option('-e, --env <KEY=VALUE>', 'Environment variable, repeatable (single-image)', collect, [])
    .action(async (image: string | undefined, opts: { name?: string; port?: number; env: string[] }) => {
      requireRole(['developer', 'admin']);

      if (image) {
        await runSingleImage(image, opts);
      } else {
        await runManifest();
      }
    });
}

async function runSingleImage(
  image: string,
  opts: { name?: string; port?: number; env: string[] },
): Promise<void> {
  const spinner = ora(`Creating application for ${chalk.cyan(image)}…`).start();
  try {
    const result = await deployApplicationUseCase(
      { image, name: opts.name, port: opts.port, env: opts.env },
      (status) => { spinner.text = `Status: ${chalk.yellow(status)}…`; },
    );
    reportResult(spinner, result);
  } catch (err) {
    spinner.fail('Deploy failed.');
    handleError(err);
  }
}

async function runManifest(): Promise<void> {
  const spinner = ora('Reading zs.yaml…').start();
  try {
    const result = await deployManifestUseCase(
      process.cwd(),
      (status) => { spinner.text = `Status: ${chalk.yellow(status)}…`; },
    );
    reportResult(spinner, result, result.manifest.app);
  } catch (err) {
    spinner.fail('Deploy failed.');
    handleError(err);
  }
}

function reportResult(spinner: Ora, { instance, timedOut }: DeployResult, appName?: string): void {
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
    if (instance.address) {
      console.log(`Address:     ${chalk.underline.cyan(instance.address)}`);
    }
  } else {
    spinner.fail(chalk.red(`Deploy ended with status: ${instance.status}`));
    console.log(`Instance ID: ${chalk.bold(instance.id)}`);
    console.log(chalk.gray('Run "zs logs <instance-id>" for details.'));
  }
}

function collect(val: string, prev: string[]): string[] {
  return [...prev, val];
}
