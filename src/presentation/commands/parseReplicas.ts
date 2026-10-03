import { InvalidArgumentError } from 'commander';
import { isValidReplicaCount } from '../../domain/replicas';

/** Commander argument parser shared by `zs deploy --replicas` and `zs scale`. */
export function parseReplicas(value: string): number {
  const replicas = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  if (!isValidReplicaCount(replicas)) {
    throw new InvalidArgumentError('must be a whole number of at least 1 (e.g. 3)');
  }
  return replicas;
}
