import { maybeAutoUpdate } from '../autoUpdate';
import { getConfigValue, setConfigValue } from '../../../infrastructure/config/store';
import { latestNewerTag, selfUpdate } from '../../../infrastructure/self-update/updater';

jest.mock('../../../infrastructure/config/store');
jest.mock('../../../infrastructure/self-update/updater');

const mockedGet = getConfigValue as jest.Mock;
const mockedSet = setConfigValue as jest.Mock;
const mockedLatest = latestNewerTag as jest.Mock;
const mockedSelf = selfUpdate as jest.Mock;

const proc = process as unknown as { pkg?: unknown };

function setPackaged(on: boolean) {
  if (on) proc.pkg = {};
  else delete proc.pkg;
}

describe('maybeAutoUpdate', () => {
  const origTTY = process.stdout.isTTY;
  const origCI = process.env.CI;

  beforeEach(() => {
    jest.clearAllMocks();
    setPackaged(true);
    process.stdout.isTTY = true;
    delete process.env.CI;
    delete process.env.ZSC_NO_AUTO_UPDATE;
    mockedGet.mockReturnValue(undefined); // never checked before
    mockedLatest.mockResolvedValue(null);
  });

  afterAll(() => {
    setPackaged(false);
    process.stdout.isTTY = origTTY;
    if (origCI === undefined) delete process.env.CI;
    else process.env.CI = origCI;
  });

  it('skips entirely when not running as the packaged binary (dev)', async () => {
    setPackaged(false);
    await maybeAutoUpdate();
    expect(mockedLatest).not.toHaveBeenCalled();
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it('skips when stdout is not a TTY (scripts/pipes)', async () => {
    process.stdout.isTTY = false;
    await maybeAutoUpdate();
    expect(mockedLatest).not.toHaveBeenCalled();
  });

  it('skips when disabled via ZSC_NO_AUTO_UPDATE', async () => {
    process.env.ZSC_NO_AUTO_UPDATE = '1';
    await maybeAutoUpdate();
    expect(mockedLatest).not.toHaveBeenCalled();
  });

  it('skips when checked within the last day', async () => {
    mockedGet.mockReturnValue(new Date(Date.now() - 60_000).toISOString());
    await maybeAutoUpdate();
    expect(mockedLatest).not.toHaveBeenCalled();
  });

  it('stamps the check and looks for a newer release when eligible', async () => {
    await maybeAutoUpdate();
    expect(mockedSet).toHaveBeenCalledWith('lastUpdateCheck', expect.any(String));
    expect(mockedLatest).toHaveBeenCalledTimes(1);
    expect(mockedSelf).not.toHaveBeenCalled(); // nothing newer -> no download
  });

  it('downloads when a newer release exists', async () => {
    mockedLatest.mockResolvedValue('v0.1.4');
    mockedSelf.mockResolvedValue({ updated: true, fromVersion: '0.1.3', toVersion: 'v0.1.4', reason: 'updated' });
    await maybeAutoUpdate();
    expect(mockedSelf).toHaveBeenCalledTimes(1);
  });
});
