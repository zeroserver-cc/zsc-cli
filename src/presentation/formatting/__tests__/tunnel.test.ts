import { describeTunnelClose } from '../tunnel';

describe('describeTunnelClose', () => {
  it.each([
    [4401, /rejected or expired/],
    [4403, /owner/],
    [4429, /Too many tunnels/],
    [4504, /unreachable/],
    [1006, /Could not reach/]
  ])('maps code %i to a readable message', (code, pattern) => {
    expect(describeTunnelClose(code, '')).toMatch(pattern);
  });

  it('includes code and reason for unknown closes', () => {
    expect(describeTunnelClose(4999, 'weird')).toContain('4999: weird');
  });
});
