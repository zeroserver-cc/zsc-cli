import { Deployment } from '../domain/entities/types';

/**
 * Replicas of a rolling redeploy (ADR 0011) still waiting their turn: they
 * update one at a time after the first one finishes. Always 0 on a backend
 * that predates QUEUED, so nothing changes there.
 */
export function queuedReplicaCount(deployments?: Deployment[]): number {
  return deployments?.filter((deployment) => deployment.status === 'QUEUED').length ?? 0;
}
