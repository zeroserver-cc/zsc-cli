import { createTunnelReporter, describeTunnelClose } from '../tunnel';

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

describe('createTunnelReporter', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('prints the identity once and never a password', () => {
    const report = createTunnelReporter();
    report({ type: 'connection-opened', username: 'u', database: 'd' });
    report({ type: 'connection-opened', username: 'u', database: 'd' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0].join(' ')).toContain('database: d, username: u');
  });

  it('explains the account cap and mentions connection pools', () => {
    createTunnelReporter()({ type: 'connection-limit' });
    expect(errorSpy.mock.calls[0].join(' ')).toMatch(/pool/);
  });

  it('names the host for unreachable endpoints', () => {
    expect(describeTunnelClose(1006, 'db.example.com')).toContain('(db.example.com)');
  });
});
