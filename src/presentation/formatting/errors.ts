import chalk from 'chalk';
import { GraphQLError } from '../../infrastructure/graphql/client';

// Defense against oversized backend payloads flooding the terminal.
const MAX_ERROR_MESSAGE_CHARS = 500;

function truncate(message: string): string {
  return message.length > MAX_ERROR_MESSAGE_CHARS
    ? `${message.slice(0, MAX_ERROR_MESSAGE_CHARS)}...`
    : message;
}

/**
 * The server rejected a field this CLI selects: a newer CLI talking to an
 * older backend (the AI catalog fields of ZSC-210 were the first case).
 */
function isSchemaMismatchError(err: GraphQLError): boolean {
  return /Cannot query field/i.test(err.message);
}

export function handleError(err: unknown): never {
  if (err instanceof GraphQLError && isSchemaMismatchError(err)) {
    console.error(
      chalk.red('Error:'),
      'This CLI version requires a newer ZeroServer backend; try again later or downgrade the CLI.'
    );
  } else if (err instanceof Error) {
    console.error(chalk.red('Error:'), truncate(err.message));
  } else {
    console.error(chalk.red('Unexpected error:'), truncate(String(err)));
  }
  process.exit(1);
}
