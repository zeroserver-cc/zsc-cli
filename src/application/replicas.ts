/**
 * Map a requested replica count to the DeployApplicationInput field. Empty when
 * nothing was requested: the backend then keeps the persisted value, and a
 * backend that predates replicas never receives the field.
 */
export function toDeployReplicasInput(replicas?: number): { replicas?: number } {
  return replicas === undefined ? {} : { replicas };
}

export class ReplicasNotSupportedError extends Error {
  constructor() {
    super('This backend does not support replicas yet. Try again once it is updated.');
    this.name = 'ReplicasNotSupportedError';
  }
}

// What a backend that predates replicas answers when it sees the new input
// field, argument or selection. Narrow on purpose: any other schema or
// validation problem must keep its own message.
const REPLICAS_UNSUPPORTED_PATTERNS = [
  /Cannot query field "(scaleApplication|desiredReplicas|effectiveReplicas|runningReplicas|replicaWarnings)"/i,
  /Field "replicas" is not defined by type "?DeployApplicationInput"?/i,
  /Unknown argument "replicas" on field/i
];

export function isReplicasUnsupportedError(err: unknown): boolean {
  return (
    err instanceof Error &&
    REPLICAS_UNSUPPORTED_PATTERNS.some((pattern) => pattern.test(err.message))
  );
}

/**
 * Runs a request that sends or selects replica fields and turns the raw GraphQL
 * schema error of an older backend into a clear message. Calls that never
 * touch replica fields cannot match, so they are unaffected.
 */
export async function withReplicasSupport<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw isReplicasUnsupportedError(err) ? new ReplicasNotSupportedError() : err;
  }
}
