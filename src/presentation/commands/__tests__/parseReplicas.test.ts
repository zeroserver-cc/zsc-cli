import { InvalidArgumentError } from 'commander';
import { parseReplicas } from '../parseReplicas';

describe('parseReplicas', () => {
  it.each([
    ['1', 1],
    ['3', 3],
    [' 5 ', 5],
    ['100', 100]
  ])('parses %p', (input, expected) => {
    expect(parseReplicas(input)).toBe(expected);
  });

  it.each(['0', '-1', '2.5', 'many', '', '3x', '1e2', '0x3'])('rejects %p', (input) => {
    expect(() => parseReplicas(input)).toThrow(InvalidArgumentError);
  });
});
