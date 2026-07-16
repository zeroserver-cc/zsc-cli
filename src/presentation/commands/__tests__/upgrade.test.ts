import { Command } from 'commander';
import { registerUpgradeCommand } from '../upgrade';
import { selfUpdate, SelfUpdateResult } from '../../../infrastructure/self-update/updater';
import { isPackagedBinary } from '../../../application/selfUpdate/autoUpdate';
import { canElevate, elevateAndRun, isRoot } from '../../../infrastructure/system/elevate';

jest.mock('../../../infrastructure/self-update/updater');
jest.mock('../../../application/selfUpdate/autoUpdate');
jest.mock('../../../infrastructure/system/elevate');
jest.mock('../../../version', () => ({ VERSION: '0.3.4' }));

const mockedSelfUpdate = selfUpdate as jest.MockedFunction<typeof selfUpdate>;
const mockedIsPackaged = isPackagedBinary as jest.MockedFunction<typeof isPackagedBinary>;
const mockedIsRoot = isRoot as jest.MockedFunction<typeof isRoot>;
const mockedCanElevate = canElevate as jest.MockedFunction<typeof canElevate>;
const mockedElevate = elevateAndRun as jest.MockedFunction<typeof elevateAndRun>;

describe('registerUpgradeCommand', () => {
  let program: Command;
  let exitSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    program = new Command();
    registerUpgradeCommand(program);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.clearAllMocks();
    mockedIsPackaged.mockReturnValue(true);
    mockedIsRoot.mockReturnValue(false);
    mockedCanElevate.mockReturnValue(true);
    mockedElevate.mockResolvedValue(0);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  async function runUpgrade(): Promise<void> {
    await program.parseAsync(['node', 'zs', 'upgrade']);
  }

  it('prints an error and exits when not running the packaged binary', async () => {
    mockedIsPackaged.mockReturnValue(false);
    await runUpgrade();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('installed binary'));
    expect(process.exitCode).toBe(1);
  });

  it('reports success when an update is applied', async () => {
    mockedSelfUpdate.mockResolvedValue({
      updated: true,
      fromVersion: '0.3.4',
      toVersion: '0.3.5',
      reason: 'updated',
    } as SelfUpdateResult);

    await runUpgrade();

    expect(logSpy).toHaveBeenCalledWith('Updated zs 0.3.4 → 0.3.5.');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('reports up-to-date', async () => {
    mockedSelfUpdate.mockResolvedValue({
      updated: false,
      fromVersion: '0.3.4',
      reason: 'up-to-date',
    } as SelfUpdateResult);

    await runUpgrade();

    expect(logSpy).toHaveBeenCalledWith('zs is already up to date (0.3.4).');
  });

  it('re-elevates with sudo on permission error', async () => {
    mockedSelfUpdate.mockResolvedValue({
      updated: false,
      fromVersion: '0.3.4',
      toVersion: '0.3.5',
      reason: 'permission',
    } as SelfUpdateResult);

    await runUpgrade();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Requesting elevation'));
    expect(mockedElevate).toHaveBeenCalledWith(['upgrade']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('fails with a clear message when permission is denied but already root', async () => {
    mockedIsRoot.mockReturnValue(true);
    mockedSelfUpdate.mockResolvedValue({
      updated: false,
      fromVersion: '0.3.4',
      toVersion: '0.3.5',
      reason: 'permission',
    } as SelfUpdateResult);

    await runUpgrade();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('running as root'));
    expect(mockedElevate).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('fails with a clear message when sudo is unavailable', async () => {
    mockedCanElevate.mockReturnValue(false);
    mockedSelfUpdate.mockResolvedValue({
      updated: false,
      fromVersion: '0.3.4',
      toVersion: '0.3.5',
      reason: 'permission',
    } as SelfUpdateResult);

    await runUpgrade();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Run as root or install sudo'));
    expect(mockedElevate).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('reports unsupported architecture', async () => {
    mockedSelfUpdate.mockResolvedValue({
      updated: false,
      fromVersion: '0.3.4',
      reason: 'unsupported-arch',
    } as SelfUpdateResult);

    await runUpgrade();

    expect(errorSpy).toHaveBeenCalledWith('No prebuilt zs binary for this OS/architecture.');
    expect(process.exitCode).toBe(1);
  });
});
