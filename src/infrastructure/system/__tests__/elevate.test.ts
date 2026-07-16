import { isRoot, canElevate, elevateAndRun } from '../elevate';
import { spawn } from 'child_process';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawn: jest.fn(),
}));

describe('elevate', () => {
  const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;
  const mockedExecSync = jest.requireMock('child_process').execSync as jest.MockedFunction<typeof import('child_process').execSync>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isRoot', () => {
    const originalPlatform = process.platform;
    let getuidMock: jest.SpyInstance | undefined;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      getuidMock?.mockRestore();
    });

    it('returns true on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(isRoot()).toBe(true);
    });

    it('returns true when getuid() is 0', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      getuidMock = jest.spyOn(process, 'getuid').mockReturnValue(0);
      expect(isRoot()).toBe(true);
    });

    it('returns false when getuid() is not 0', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      getuidMock = jest.spyOn(process, 'getuid').mockReturnValue(1000);
      expect(isRoot()).toBe(false);
    });
  });

  describe('canElevate', () => {
    it('returns false on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(canElevate()).toBe(false);
    });

    it('returns true when sudo is available', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockedExecSync.mockImplementation(() => Buffer.from(''));
      expect(canElevate()).toBe(true);
      expect(mockedExecSync).toHaveBeenCalledWith('command -v sudo', { stdio: 'ignore' });
    });

    it('returns false when sudo is not available', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockedExecSync.mockImplementation(() => { throw new Error('not found'); });
      expect(canElevate()).toBe(false);
    });
  });

  describe('elevateAndRun', () => {
    it('spawns sudo with the current executable and supplied args', async () => {
      const onSpy = jest.fn();
      mockedSpawn.mockReturnValue({ on: onSpy } as any);

      const promise = elevateAndRun(['upgrade']);

      expect(mockedSpawn).toHaveBeenCalledWith('sudo', [process.execPath, 'upgrade'], {
        stdio: 'inherit',
        detached: false,
      });

      // simulate clean exit with code 0
      const exitHandler = onSpy.mock.calls.find(([event]) => event === 'exit')?.[1];
      exitHandler?.(0, null);

      await expect(promise).resolves.toBe(0);
    });

    it('resolves with exit code from the elevated child', async () => {
      const onSpy = jest.fn();
      mockedSpawn.mockReturnValue({ on: onSpy } as any);

      const promise = elevateAndRun(['upgrade']);
      const exitHandler = onSpy.mock.calls.find(([event]) => event === 'exit')?.[1];
      exitHandler?.(42, null);

      await expect(promise).resolves.toBe(42);
    });

    it('resolves with 1 when the child cannot be spawned', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const onSpy = jest.fn();
      mockedSpawn.mockReturnValue({ on: onSpy } as any);

      const promise = elevateAndRun(['upgrade']);
      const errorHandler = onSpy.mock.calls.find(([event]) => event === 'error')?.[1];
      errorHandler?.(new Error('ENOENT'));

      await expect(promise).resolves.toBe(1);
      consoleErrorSpy.mockRestore();
    });
  });
});
