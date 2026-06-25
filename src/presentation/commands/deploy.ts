import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { deployApplicationUseCase } from '../../application/usecases/DeployApplicationUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { handleError } from '../formatting/errors';

export function registerDeployCommand(program: Command): void {
  program
    .command('deploy <image>')
    .description('Deploy a Docker image to the ZSC network')
    .option('-n, --name <name>', 'Application name (defaults to image name)')
    .option('-p, --port <port>', 'Container port to expose', parseInt)
    .option('-e, --env <KEY=VALUE>', 'Environment variable (repeatable)', collect, [])
    .action(async (image: string, opts: { name?: string; port?: number; env: string[] }) => {
      requireRole(['developer', 'admin']);
      const spinner = ora(`Creating application for ${chalk.cyan(image)}…`).start();

      try {
        const { instance, timedOut } = await deployApplicationUseCase(
          { image, name: opts.name, port: opts.port, env: opts.env },
          (status) => { spinner.text = `Status: ${chalk.yellow(status)}…`; },
        );

        if (timedOut) {
          spinner.warn(chalk.yellow('Deploy timed out waiting for RUNNING status.'));
          console.log(`Instance ID: ${chalk.bold(instance.id)}`);
          console.log(`Last status: ${instance.status}`);
          console.log(chalk.gray('Check "zs list" for updates.'));
          return;
        }

        if (instance.status === 'RUNNING') {
          spinner.succeed(chalk.green('Deploy successful!'));
          console.log(`Instance ID: ${chalk.bold(instance.id)}`);
          if (instance.address) {
            console.log(`Address:     ${chalk.underline.cyan(instance.address)}`);
          }
        } else {
          spinner.fail(chalk.red(`Deploy ended with status: ${instance.status}`));
          console.log(`Instance ID: ${chalk.bold(instance.id)}`);
          console.log(chalk.gray('Run "zs logs <instance-id>" for details.'));
        }
      } catch (err) {
        spinner.fail('Deploy failed.');
        handleError(err);
      }
    });
}

function collect(val: string, prev: string[]): string[] {
  return [...prev, val];
}
