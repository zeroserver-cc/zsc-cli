import chalk from 'chalk';
import { ManagedDatabase } from '../../domain/entities/types';

/**
 * One-cell summary of a database's public endpoint for "zs db list":
 * "db.zeroserver.cc:15432" while exposed, "-" otherwise. An exposed row
 * without host/port (allocation still propagating) shows a muted hint
 * instead of a broken address.
 */
export function publicEndpointSummary(database: ManagedDatabase): string {
  if (!database.publicAccess) return chalk.gray('-');
  if (!database.publicHost || !database.publicPort) return chalk.yellow('pending');
  return chalk.green(`${database.publicHost}:${database.publicPort}`);
}
