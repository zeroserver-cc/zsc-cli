import chalk from 'chalk';
import { ManagedDatabaseReplica } from '../../domain/entities/types';

// A copy in one of these statuses is part of the live topology (or on its way
// into it). STALE/FAILED rows are superseded copies the reconcile sweep still
// has to tear down: history, not capacity.
const ACTIVE_STATUSES = ['PROVISIONING', 'SYNCING', 'STREAMING'];

/**
 * One-cell summary of a database's read replicas for "zs db list":
 * "0", "1 streaming", "2 syncing". Only live REPLICA-role copies count; the
 * primary never does, and superseded copies (stale/failed, awaiting teardown)
 * show up as a muted suffix instead of inflating the number. With no live copy
 * left the failure stays loud: "0 (failed, replacing)".
 */
export function replicaSummary(replicas: ManagedDatabaseReplica[]): string {
  const readReplicas = replicas.filter(
    (replica) => replica.role === 'REPLICA' && replica.status !== 'DELETED'
  );
  const active = readReplicas.filter((replica) => ACTIVE_STATUSES.includes(replica.status));
  const superseded = readReplicas.length - active.length;
  const cleanupSuffix = superseded > 0 ? chalk.gray(` (+${superseded} pending cleanup)`) : '';

  if (active.length === 0) {
    if (superseded > 0) return chalk.red('0 (failed, replacing)');
    return chalk.gray('0');
  }

  const count = String(active.length);
  if (active.every((replica) => replica.status === 'STREAMING')) {
    return chalk.green(`${count} streaming`) + cleanupSuffix;
  }
  const pending = active.find((replica) => replica.status !== 'STREAMING')!;
  return chalk.yellow(`${count} ${pending.status.toLowerCase()}`) + cleanupSuffix;
}
