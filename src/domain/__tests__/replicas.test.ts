import { isValidReplicaCount } from '../replicas';

describe('isValidReplicaCount', () => {
  it.each([1, 2, 5, 100])('accepts %p', (value) => {
    expect(isValidReplicaCount(value)).toBe(true);
  });

  it.each([0, -1, 2.5, NaN, Infinity, '3', null, undefined, true, [3]])('rejects %p', (value) => {
    expect(isValidReplicaCount(value)).toBe(false);
  });
});
