import { replicaSummary } from '../replicas';
import { ManagedDatabaseReplica, ManagedDatabaseReplicaStatus } from '../../../domain/entities/types';

function replica(status: ManagedDatabaseReplicaStatus, role: 'PRIMARY' | 'REPLICA' = 'REPLICA'): ManagedDatabaseReplica {
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
    expect(replicaSummary([replica('STREAMING', 'PRIMARY'), replica('STREAMING')])).toBe('1 streaming');
  });

  it('counts only read replicas, not the primary', () => {
    expect(replicaSummary([replica('STREAMING', 'PRIMARY'), replica('STREAMING'), replica('STREAMING')])).toBe(
      '2 streaming',
    );
  });

  it('surfaces a failed replica over the other statuses', () => {
    expect(replicaSummary([replica('STREAMING'), replica('FAILED')])).toBe('2 failed');
  });

  it('shows the pending status while a replica is not streaming yet', () => {
    expect(replicaSummary([replica('STREAMING'), replica('SYNCING')])).toBe('2 syncing');
  });

  it('shows a stale replica', () => {
    expect(replicaSummary([replica('STALE')])).toBe('1 stale');
  });
});
