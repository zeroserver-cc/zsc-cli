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
  it('says nothing when the topology is full', () => {
    expect(replicaPlacementNote(placement({ live: 1, pending: 0 }))).toBeNull();
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
    const notes = reasons.map((reason) => replicaPlacementNote(placement({ reason })));

    for (const note of notes) {
      expect(note).toMatch(/^1 replica pending: \S/);
      expect(note).not.toContain('undefined');
    }
    expect(new Set(notes).size).toBe(reasons.length);
  });

  it('points at the third-party admission without naming any node', () => {
    expect(replicaPlacementNote(placement({ reason: 'NO_ADMITTED_PROVIDER' }))).toBe(
      '1 replica pending: no third-party node is cleared to host databases yet; retrying automatically'
    );
  });

  it('pluralizes and adds the check time when known', () => {
    const note = replicaPlacementNote(
      placement({
        desired: 2,
        pending: 2,
        reason: 'COOLDOWN_AFTER_FAILURE',
        checkedAt: '2026-11-02T12:00:00.000Z'
      })
    );
    expect(note).toMatch(/^2 replicas pending: a recent replica attempt failed; .*\(checked .+\)$/);
  });

  it('waits for the first placement check when no reason is recorded yet', () => {
    expect(replicaPlacementNote(placement())).toBe(
      '1 replica pending: waiting for the next placement check (every few minutes)'
    );
  });
});
