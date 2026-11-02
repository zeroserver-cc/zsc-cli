import { replicaPlacementNote, replicaSummary } from '../replicas';
import {
  ManagedDatabaseReplica,
  ManagedDatabaseReplicaStatus,
  ReplicaPlacement
} from '../../../domain/entities/types';

function replica(
  status: ManagedDatabaseReplicaStatus,
  role: 'PRIMARY' | 'REPLICA' = 'REPLICA'
): ManagedDatabaseReplica {
  return { id: `rep-${status}-${role}`, role, status, machineId: 'machine-1' };
}

function placement(overrides: Partial<ReplicaPlacement> = {}): ReplicaPlacement {
  return { desired: 1, live: 0, pending: 1, reason: null, checkedAt: null, ...overrides };
}

describe('replicaSummary', () => {
  it('shows 0 when the database has no copies at all', () => {
    expect(replicaSummary([])).toBe('0');
  });

  it('shows 0 when only the primary exists (single-node, no HA)', () => {
    expect(replicaSummary([replica('STREAMING', 'PRIMARY')])).toBe('0');
  });

  it('ignores deleted replicas', () => {
    expect(replicaSummary([replica('STREAMING', 'PRIMARY'), replica('DELETED')])).toBe('0');
  });

  it('summarizes streaming replicas', () => {
    expect(replicaSummary([replica('STREAMING', 'PRIMARY'), replica('STREAMING')])).toBe(
      '1 streaming'
    );
  });

  it('counts only read replicas, not the primary', () => {
    expect(
      replicaSummary([replica('STREAMING', 'PRIMARY'), replica('STREAMING'), replica('STREAMING')])
    ).toBe('2 streaming');
  });

  it('does not count a superseded failed copy as a live replica', () => {
    expect(replicaSummary([replica('STREAMING'), replica('FAILED')])).toBe(
      '1 streaming (+1 pending cleanup)'
    );
  });

  it('lists every superseded copy in the cleanup suffix', () => {
    expect(replicaSummary([replica('STREAMING'), replica('STALE'), replica('FAILED')])).toBe(
      '1 streaming (+2 pending cleanup)'
    );
  });

  it('shows the pending status while a replica is not streaming yet', () => {
    expect(replicaSummary([replica('STREAMING'), replica('SYNCING')])).toBe('2 syncing');
  });

  it('keeps the failure loud when no live replica remains', () => {
    expect(replicaSummary([replica('FAILED')])).toBe('0 (failed, replacing)');
    expect(replicaSummary([replica('STALE')])).toBe('0 (failed, replacing)');
  });
});

describe('replicaSummary with the replica target', () => {
  it('shows live over desired when nothing is placed yet', () => {
    expect(replicaSummary([replica('STREAMING', 'PRIMARY')], placement())).toBe('0/1');
  });

  it('shows live over desired next to the replica status', () => {
    expect(
      replicaSummary(
        [replica('STREAMING', 'PRIMARY'), replica('STREAMING')],
        placement({ desired: 2, live: 1, pending: 1 })
      )
    ).toBe('1/2 streaming');
  });

  it('keeps the failure loud with the target', () => {
    expect(replicaSummary([replica('FAILED')], placement())).toBe('0/1 (failed, replacing)');
  });

  it('shows 0/0 for a single-node database', () => {
    expect(replicaSummary([], placement({ desired: 0, pending: 0 }))).toBe('0/0');
  });
});

describe('replicaPlacementNote', () => {
  const running = (overrides: Partial<ReplicaPlacement> = {}) => ({
    status: 'RUNNING' as const,
    replicaPlacement: placement(overrides)
  });

  it('says nothing when the topology is full', () => {
    expect(replicaPlacementNote(running({ live: 1, pending: 0 }))).toBeNull();
  });

  it('says nothing against a backend without the field', () => {
    expect(replicaPlacementNote({ status: 'RUNNING' })).toBeNull();
  });

  it('says nothing while the database is not running (placement only runs there)', () => {
    for (const status of ['PENDING', 'ERROR', 'DELETING'] as const) {
      expect(replicaPlacementNote({ status, replicaPlacement: placement() })).toBeNull();
    }
  });

  it('explains every reason the platform can report', () => {
    const reasons: ReplicaPlacement['reason'][] = [
      'NO_ELIGIBLE_NODE',
      'ONLY_OWNER_NODES',
      'NO_ADMITTED_PROVIDER',
      'PRIMARY_UNREACHABLE',
      'COOLDOWN_AFTER_FAILURE',
      'MISSING_REPLICATION_MATERIAL'
    ];
    const notes = reasons.map((reason) => replicaPlacementNote(running({ reason })));

    for (const note of notes) {
      expect(note).toMatch(/^1 replica pending: \S/);
      expect(note).not.toContain('undefined');
    }
    expect(new Set(notes).size).toBe(reasons.length);
  });

  it('falls back to a generic text for a reason this CLI does not know', () => {
    const note = replicaPlacementNote(
      running({ reason: 'SOMETHING_NEW' as ReplicaPlacement['reason'] })
    );
    expect(note).toBe(
      '1 replica pending: the platform could not place it yet; retrying automatically'
    );
  });

  it('points at the third-party admission without naming any node', () => {
    expect(replicaPlacementNote(running({ reason: 'NO_ADMITTED_PROVIDER' }))).toBe(
      '1 replica pending: no third-party node is cleared to host databases yet; retrying automatically'
    );
  });

  it('pluralizes and shows only the time for a check made today', () => {
    const checkedAt = new Date(2026, 10, 2, 12, 0, 0);
    const note = replicaPlacementNote(
      running({
        desired: 2,
        pending: 2,
        reason: 'COOLDOWN_AFTER_FAILURE',
        checkedAt: checkedAt.toISOString()
      }),
      new Date(2026, 10, 2, 15, 0, 0)
    );
    expect(note).toBe(
      `2 replicas pending: a recent replica attempt failed; retrying after a short cooldown (checked ${checkedAt.toLocaleTimeString()})`
    );
  });

  it('shows the date when the check is not from today', () => {
    const checkedAt = new Date(2026, 10, 1, 12, 0, 0);
    const note = replicaPlacementNote(
      running({ reason: 'NO_ELIGIBLE_NODE', checkedAt: checkedAt.toISOString() }),
      new Date(2026, 10, 2, 15, 0, 0)
    );
    expect(note).toContain(`(checked ${checkedAt.toLocaleString()})`);
  });

  it('tells when the first placement check has not run yet', () => {
    expect(replicaPlacementNote(running())).toBe(
      '1 replica pending: the next placement check runs within a few minutes'
    );
  });
});
