import { assertSecureTunnelUrl } from '../tunnelUrl';

describe('assertSecureTunnelUrl', () => {
  it.each([
    'wss://db.zeroserver.cc/api/v1/db-tunnel/x',
    'ws://localhost:3001/x',
    'ws://127.0.0.1:3001/x',
    'ws://[::1]:3001/x'
  ])('accepts %s', (url) => {
    expect(() => assertSecureTunnelUrl(url)).not.toThrow();
  });

  it.each(['ws://db.zeroserver.cc/x', 'http://localhost/x', 'https://db.zeroserver.cc/x'])(
    'rejects %s',
    (url) => {
      expect(() => assertSecureTunnelUrl(url)).toThrow(/Refusing to open a tunnel/);
    }
  );

  it('rejects garbage', () => {
    expect(() => assertSecureTunnelUrl('not a url')).toThrow(/invalid tunnel URL/);
  });
});
