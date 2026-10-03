import { queuedReplicaCount } from '../rollout';
import { Deployment } from '../../domain/entities/types';

const deployment = (status: Deployment['status'], id: string): Deployment => ({
  id,
  image: 'ghcr.io/x/app:1',
  status,
  createdAt: '2026-07-31T00:00:00Z'
});

describe('queuedReplicaCount', () => {
  it('counts only the QUEUED deployments', () => {
    expect(
      queuedReplicaCount([
        deployment('SUCCESS', 'a'),
        deployment('QUEUED', 'b'),
        deployment('QUEUED', 'c'),
        deployment('PENDING', 'd'),
        deployment('FAILED', 'e')
      ])
    ).toBe(2);
  });

  it('is 0 without history or without a queue (backends that predate QUEUED)', () => {
    expect(queuedReplicaCount(undefined)).toBe(0);
    expect(queuedReplicaCount([])).toBe(0);
    expect(queuedReplicaCount([deployment('SUCCESS', 'a'), deployment('PENDING', 'b')])).toBe(0);
  });
});
