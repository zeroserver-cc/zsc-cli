import { readStdin } from '../prompt';

describe('readStdin', () => {
  it('rejects fast when stdin is a TTY (nothing piped) instead of blocking', async () => {
    const original = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    try {
      await expect(readStdin()).rejects.toThrow(/stdin is a TTY/);
    } finally {
      if (original) {
        Object.defineProperty(process.stdin, 'isTTY', original);
      }
    }
  });
});
