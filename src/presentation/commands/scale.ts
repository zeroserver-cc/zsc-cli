import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { scaleApplicationUseCase } from '../../application/usecases/ReplicasUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import { handleError } from '../formatting/errors';
import { replicaReportLines } from '../formatting/replicaReport';
import { parseReplicas } from './parseReplicas';

export function registerScaleCommand(program: Command): void {
  program
    .command('scale')
    .description('Set how many replicas an application runs behind its single URL')
    .argument('<app>', 'Application name')
    .argument('<replicas>', 'Number of replicas (whole number, 1 or more)', parseReplicas)
    .addHelpText(
      'after',
      `
Replicas are separate instances balanced round-robin, with no sticky sessions:
the app must be stateless (keep sessions in a signed cookie or an external
database). Each replica is billed as its own instance. Apps with volumes or a
managed database keep one replica; the reason is shown as a warning.

Examples:
  $ zs scale my-api 3
  $ zs scale my-api 1`
    )
    .action(async (app: string, replicas: number) => {
      requireRole(['developer', 'admin']);
      const spinner = ora(`Scaling ${chalk.cyan(app)} to ${replicas}…`).start();
      try {
        const { appName, status } = await scaleApplicationUseCase(app, replicas);
        spinner.succeed(`Scale request accepted: ${chalk.bold(appName)}`);
        replicaReportLines(status).forEach((line) => console.log(line));
      } catch (err) {
        spinner.fail('Scale failed.');
        handleError(err);
      }
    });
}
