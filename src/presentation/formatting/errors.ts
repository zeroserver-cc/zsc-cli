import chalk from 'chalk';
import { GraphQLError } from '../../infrastructure/graphql/client';

export function handleError(err: unknown): never {
  if (err instanceof GraphQLError) {
    console.error(chalk.red('Error:'), err.message);
  } else if (err instanceof Error) {
    console.error(chalk.red('Error:'), err.message);
  } else {
    console.error(chalk.red('Unexpected error:'), String(err));
  }
  process.exit(1);
}
