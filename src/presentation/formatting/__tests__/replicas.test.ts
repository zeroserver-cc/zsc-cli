import { replicaSummary } from '../replicas';
import {
  ManagedDatabaseReplica,
  ManagedDatabaseReplicaStatus
} from '../../../domain/entities/types';

function replica(
  status: ManagedDatabaseReplicaStatus,
  role: 'PRIMARY' | 'REPLICA' = 'REPLICA'
): ManagedDatabaseReplica {
  return { id: `rep-${status}-${role}`, role, status, machineId: 'machine-1' };
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
