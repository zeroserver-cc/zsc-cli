import chalk from 'chalk';
import {
  ManagedDatabase,
  ManagedDatabaseReplica,
  ReplicaPlacement,
  ReplicaPlacementReason
} from '../../domain/entities/types';

// A copy in one of these statuses is part of the live topology (or on its way
// into it). STALE/FAILED rows are superseded copies the reconcile sweep still
// has to tear down: history, not capacity.
const ACTIVE_STATUSES = ['PROVISIONING', 'SYNCING', 'STREAMING'];

const PLACEMENT_REASONS: Record<ReplicaPlacementReason, string> = {
  NO_ELIGIBLE_NODE: 'no online node meets the requirements right now; retrying automatically',
  ONLY_OWNER_NODES:
    "replicas must run on another provider's node and only your own nodes are eligible right now",
  NO_ADMITTED_PROVIDER:
    'no third-party node is cleared to host databases yet; retrying automatically',
  PRIMARY_UNREACHABLE: "the primary's node is offline; replicas resume once it is back",
  COOLDOWN_AFTER_FAILURE: 'a recent replica attempt failed; retrying after a short cooldown',
  MISSING_REPLICATION_MATERIAL:
    'this database was created without replication; set its replicas to 0 and back up to enable it'
};

/**
 * One-cell summary of a database's read replicas for "zs db list":
 * "0/1", "1/1 streaming", "2/2 syncing". Only live REPLICA-role copies count;
 * the primary never does, and superseded copies (stale/failed, awaiting
 * teardown) show up as a muted suffix instead of inflating the number. With no
 * live copy left the failure stays loud: "0/1 (failed, replacing)".
 */
export function replicaSummary(
  replicas: ManagedDatabaseReplica[],
  placement?: ReplicaPlacement
): string {
  const readReplicas = replicas.filter(
    (replica) => replica.role === 'REPLICA' && replica.status !== 'DELETED'
  );
  const active = readReplicas.filter((replica) => ACTIVE_STATUSES.includes(replica.status));
  const superseded = readReplicas.length - active.length;
  const cleanupSuffix = superseded > 0 ? chalk.gray(` (+${superseded} pending cleanup)`) : '';
  const count = placement ? `${active.length}/${placement.desired}` : String(active.length);

  if (active.length === 0) {
    if (superseded > 0) return chalk.red(`${count} (failed, replacing)`);
    return placement && placement.pending > 0 ? chalk.yellow(count) : chalk.gray(count);
  }

  if (active.every((replica) => replica.status === 'STREAMING')) {
    return chalk.green(`${count} streaming`) + cleanupSuffix;
  }
  const pending = active.find((replica) => replica.status !== 'STREAMING')!;
  return chalk.yellow(`${count} ${pending.status.toLowerCase()}`) + cleanupSuffix;
}

// A newer backend may report a category this CLI does not know yet.
const UNKNOWN_REASON = 'the platform could not place it yet; retrying automatically';

function checkedLabel(checkedAt: string, now: Date): string {
  const checked = new Date(checkedAt);
  const sameDay = checked.toDateString() === now.toDateString();
  return sameDay ? checked.toLocaleTimeString() : checked.toLocaleString();
}

/**
 * Why replicas are missing, or null when there is nothing to say: topology
 * full, database not RUNNING (placement only runs there) or a backend that
 * predates the field. Never more than the platform's category: which nodes
 * were considered stays private.
 */
export function replicaPlacementNote(
  database: Pick<ManagedDatabase, 'status' | 'replicaPlacement'>,
  now: Date = new Date()
): string | null {
  const placement = database.replicaPlacement;
  if (!placement || placement.pending <= 0 || database.status !== 'RUNNING') return null;
  const copies = `${placement.pending} replica${placement.pending === 1 ? '' : 's'} pending`;
  if (!placement.reason) return `${copies}: the next placement check runs within a few minutes`;
  const checked = placement.checkedAt ? ` (checked ${checkedLabel(placement.checkedAt, now)})` : '';
  return `${copies}: ${PLACEMENT_REASONS[placement.reason] ?? UNKNOWN_REASON}${checked}`;
}
