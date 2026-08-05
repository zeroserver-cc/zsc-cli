import chalk from 'chalk';
import { ManagedDatabaseReplica } from '../../domain/entities/types';

/**
 * One-cell summary of a database's read replicas for "zs db list":
 * "0", "1 streaming", "2 syncing", "1 failed". Only live REPLICA-role copies
 * count; the primary never does. A failed replica dominates the summary so it
 * stands out in the table.
 */
export function replicaSummary(replicas: ManagedDatabaseReplica[]): string {
  const readReplicas = replicas.filter((replica) => replica.role === 'REPLICA' && replica.status !== 'DELETED');
  if (readReplicas.length === 0) return chalk.gray('0');

  const count = String(readReplicas.length);
  const failed = readReplicas.find((replica) => replica.status === 'FAILED');
  if (failed) return chalk.red(`${count} failed`);
  if (readReplicas.every((replica) => replica.status === 'STREAMING')) {
    return chalk.green(`${count} streaming`);
  }
  const pending = readReplicas.find((replica) => replica.status !== 'STREAMING')!;
  return chalk.yellow(`${count} ${pending.status.toLowerCase()}`);
}
