import net, { AddressInfo } from 'node:net';
import { listenLocal } from '../localListener';

function ipv6Available(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(0, '::1', () => s.close(() => resolve(true)));
  });
}

function reach(host: string, port: number): Promise<string> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    s.on('data', (d) => {
      resolve(d.toString().trim());
      s.destroy();
    });
    s.on('error', (e) => resolve(`error:${(e as NodeJS.ErrnoException).code}`));
  });
}

const listenAll = (server: net.Server, host: string): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve((server.address() as AddressInfo).port));
  });

describe('listenLocal on both loopbacks', () => {
  let hasV6 = false;
  beforeAll(async () => {
    hasV6 = await ipv6Available();
  });

  it('answers on 127.0.0.1 and, when IPv6 exists, on ::1 and localhost too', async () => {
    const listener = await listenLocal(0, (c) => c.end('TUNNEL\n'));
    try {
      expect(await reach('127.0.0.1', listener.port)).toBe('TUNNEL');
      if (hasV6) {
        expect(await reach('::1', listener.port)).toBe('TUNNEL');
        expect(await reach('localhost', listener.port)).toBe('TUNNEL');
      }
    } finally {
      await listener.close();
    }
  });

  it('never lets another wildcard listener answer on loopback (hijack scenario)', async () => {
    const other = net.createServer((s) => s.end('OTHER-PROCESS\n'));
    const port = await listenAll(other, '::').catch(() => listenAll(other, '0.0.0.0'));
    try {
      const outcome = await listenLocal(port, (c) => c.end('TUNNEL\n')).then(
        (l) => l,
        (e: Error) => e
      );
      if (outcome instanceof Error) {
        // Platforms where the wildcard bind blocks ours must fail loudly, not coexist.
        expect(outcome.message).toMatch(/already in use|Could not listen/);
        return;
      }
      try {
        expect(await reach('127.0.0.1', port)).toBe('TUNNEL');
        if (hasV6) expect(await reach('::1', port)).toBe('TUNNEL');
      } finally {
        await outcome.close();
      }
    } finally {
      await new Promise<void>((r) => other.close(() => r()));
    }
  });

  it('fails and releases 127.0.0.1 when ::1 is taken by another process', async () => {
    if (!hasV6) return;
    const other = net.createServer((s) => s.end('OTHER-PROCESS\n'));
    const port = await listenAll(other, '::1');
    try {
      await expect(listenLocal(port, () => undefined)).rejects.toThrow(/already in use/);
      // The v4 side must not stay bound after the failure.
      const probe = net.createServer();
      await new Promise<void>((resolve, reject) => {
        probe.once('error', reject);
        probe.listen(port, '127.0.0.1', resolve);
      });
      await new Promise<void>((r) => probe.close(() => r()));
    } finally {
      await new Promise<void>((r) => other.close(() => r()));
    }
  });
});
