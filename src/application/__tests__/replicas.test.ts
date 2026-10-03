import {
  isReplicasUnsupportedError,
  ReplicasNotSupportedError,
  toDeployReplicasInput,
  withReplicasSupport
} from '../replicas';

describe('toDeployReplicasInput', () => {
  it('is empty when no replicas were requested, so the stored value is kept', () => {
    expect(toDeployReplicasInput(undefined)).toEqual({});
  });

  it('carries the requested count', () => {
    expect(toDeployReplicasInput(3)).toEqual({ replicas: 3 });
  });
});

describe('isReplicasUnsupportedError', () => {
  it.each([
    'Variable "$input" got invalid value 3 at "input.replicas"; Field "replicas" is not defined by type "DeployApplicationInput".',
    'Variable "$input" got invalid value 3 at "input.replicas"; Field "replicas" is not defined by type DeployApplicationInput.',
    'Cannot query field "scaleApplication" on type "Mutation". Did you mean "stopApplication"?',
    'Cannot query field "desiredReplicas" on type "Application".',
    'Cannot query field "replicaWarnings" on type "Application".',
    'Unknown argument "replicas" on field "Mutation.scaleApplication".'
  ])('recognises: %s', (message) => {
    expect(isReplicasUnsupportedError(new Error(message))).toBe(true);
  });

  it.each([
    'No eligible node',
    'replicas must be at most 100',
    'Cannot query field "curated" on type "AiModel".',
    'Field "country" is not defined by type "DeployApplicationInput".'
  ])('leaves other errors alone: %s', (message) => {
    expect(isReplicasUnsupportedError(new Error(message))).toBe(false);
  });

  it('ignores values that are not errors', () => {
    expect(isReplicasUnsupportedError('Cannot query field "scaleApplication"')).toBe(false);
  });
});

describe('withReplicasSupport', () => {
  it('returns the call result untouched', async () => {
    await expect(withReplicasSupport(async () => 'ok')).resolves.toBe('ok');
  });

  it('rethrows an unsupported-backend error as ReplicasNotSupportedError', async () => {
    await expect(
      withReplicasSupport(async () => {
        throw new Error('Cannot query field "scaleApplication" on type "Mutation".');
      })
    ).rejects.toBeInstanceOf(ReplicasNotSupportedError);
  });

  it('rethrows any other error as it came', async () => {
    const original = new Error('No eligible node');
    await expect(
      withReplicasSupport(async () => {
        throw original;
      })
    ).rejects.toBe(original);
  });
});
