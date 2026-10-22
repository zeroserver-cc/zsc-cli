import net from 'node:net';
import { bridgeConnection } from '../bridgeConnection';
import { TunnelChannel, TunnelCloseInfo } from '../ports';
import { listenLocal } from '../../../infrastructure/tunnel/localListener';

type Script = Array<{ closeWith?: number; echo?: boolean }>;

/** Each opened channel follows the next script step: close with a code right away, or echo. */
function scriptedOpener(script: Script) {
  const channels: Array<{ sent: string[]; closed: boolean }> = [];
  const open = jest.fn(async (): Promise<TunnelChannel> => {
    const step = script[Math.min(channels.length, script.length - 1)];
    const record = { sent: [] as string[], closed: false };
    channels.push(record);
    let closeListener: (info: TunnelCloseInfo) => void = () => undefined;
    let messageListener: (chunk: Uint8Array) => void = () => undefined;
    const channel: TunnelChannel = {
      bufferedAmount: 0,
      send(chunk) {
        record.sent.push(Buffer.from(chunk).toString());
        if (step.echo)
          setImmediate(() => messageListener(Buffer.from(chunk.toString().toUpperCase())));
      },
      close() {
        record.closed = true;
      },
      onMessage: (l) => (messageListener = l),
      onClose: (l) => {
        closeListener = l;
        if (step.closeWith !== undefined) {
          setImmediate(() => closeListener({ code: step.closeWith!, reason: 'x' }));
        }
      }
    };
    return channel;
  });
  return { open, channels };
}

async function run(script: Script, clientWrites: string[], waitMs = 150) {
  const { open, channels } = scriptedOpener(script);
  const outcomes: Promise<TunnelCloseInfo | Error>[] = [];
  const listener = await listenLocal(0, (c) => {
    outcomes.push(bridgeConnection(c, open, { retryDelayMs: 5 }).catch((e) => e as Error));
  });
  const client = net.connect(listener.port, '127.0.0.1');
  client.on('error', () => undefined);
  client.on('error', () => undefined);
  const received: string[] = [];
  client.on('data', (d) => received.push(d.toString()));
  const closed = new Promise<void>((r) => client.on('close', () => r()));
  await new Promise((r) => client.once('connect', r));
  for (const w of clientWrites) client.write(w);
  await new Promise((r) => setTimeout(r, waitMs));
  const outcome = await Promise.race([
    outcomes[0],
    new Promise<undefined>((r) => setTimeout(() => r(undefined), 50))
  ]);
  client.destroy();
  await closed;
  await listener.close();
  return { open, channels, received: received.join(''), outcome };
}

describe('bridgeConnection retry on 4504', () => {
  it('retries a connection that never carried server data and replays client bytes', async () => {
    const { open, channels, received } = await run(
      [{ closeWith: 4504 }, { closeWith: 4504 }, { echo: true }],
      ['hello']
    );

    expect(open).toHaveBeenCalledTimes(3);
    expect(channels[2].sent).toEqual(['hello']);
    expect(received).toBe('HELLO');
  });

  it('gives up after 3 retries and surfaces 4504', async () => {
    const { open, outcome } = await run([{ closeWith: 4504 }], ['hello']);

    expect(open).toHaveBeenCalledTimes(4);
    expect(outcome).toEqual({ code: 4504, reason: 'x' });
  });

  it.each([4401, 4403, 4429])('does not retry close code %i', async (code) => {
    const { open, outcome } = await run([{ closeWith: code }], ['hello']);

    expect(open).toHaveBeenCalledTimes(1);
    expect((outcome as TunnelCloseInfo).code).toBe(code);
  });

  it('does not retry once the server sent bytes', async () => {
    let attempt = 0;
    const open = jest.fn(async (): Promise<TunnelChannel> => {
      attempt++;
      let onClose: (i: TunnelCloseInfo) => void = () => undefined;
      return {
        bufferedAmount: 0,
        send: () => undefined,
        close: () => undefined,
        onMessage: (l) => setImmediate(() => l(Buffer.from('greeting'))),
        onClose: (l) => {
          onClose = l;
          setTimeout(() => onClose({ code: 4504, reason: 'late' }), 20);
        }
      };
    });
    const listener = await listenLocal(0, (c) => {
      void bridgeConnection(c, open, { retryDelayMs: 5 });
    });
    const client = net.connect(listener.port, '127.0.0.1');
    client.on('error', () => undefined);
    client.resume();
    const closed = new Promise<void>((r) => client.on('close', () => r()));
    await closed;
    await listener.close();

    expect(attempt).toBe(1);
  });

  it('stops retrying when the local client goes away during the backoff', async () => {
    const { open, channels } = scriptedOpener([{ closeWith: 4504 }]);
    const listener = await listenLocal(0, (c) => {
      void bridgeConnection(c, open, { retryDelayMs: 300 });
    });
    const client = net.connect(listener.port, '127.0.0.1');
    client.on('error', () => undefined);
    client.resume();
    await new Promise((r) => setTimeout(r, 60));
    client.destroy();
    await new Promise((r) => setTimeout(r, 400));
    await listener.close();

    expect(channels).toHaveLength(1);
  });
});
