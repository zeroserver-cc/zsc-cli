import { Command } from 'commander';
import { registerWalletCommands } from '../wallet';
import { graphqlWalletGateway } from '../../../infrastructure/graphql/walletGateway';
import { getConfigValue } from '../../../infrastructure/config/store';
import { WalletOverview, WalletTopUpProgress } from '../../../domain/wallet';

const mockSpinner = { start: jest.fn(), stop: jest.fn() };
mockSpinner.start.mockReturnValue(mockSpinner);

jest.mock('ora', () => ({ __esModule: true, default: jest.fn(() => mockSpinner) }));
jest.mock('../../../infrastructure/system/openBrowser', () => ({
  openInBrowser: jest.fn().mockResolvedValue(false)
}));
jest.mock('../../../infrastructure/config/store', () => ({ getConfigValue: jest.fn() }));
jest.mock('../../../infrastructure/graphql/walletGateway', () => ({
  graphqlWalletGateway: {
    getOverview: jest.fn(),
    getTransactions: jest.fn(),
    getTopUpProgress: jest.fn(),
    startTopUp: jest.fn()
  }
}));
// Keeps the 5-minute deadline from depending on the real 3-second sleep.
jest.mock('../../../application/usecases/WalletUseCase', () => {
  const actual = jest.requireActual('../../../application/usecases/WalletUseCase');
  return {
    ...actual,
    waitForTopUpUseCase: (gateway: unknown, options: Record<string, unknown>) =>
      actual.waitForTopUpUseCase(gateway, { ...options, intervalMs: 0, timeoutMs: 0 })
  };
});

const gateway = graphqlWalletGateway as jest.Mocked<typeof graphqlWalletGateway>;
const mockedConfig = getConfigValue as jest.MockedFunction<typeof getConfigValue>;

const OVERVIEW: WalletOverview = {
  balanceCents: 0,
  paymentMode: 'TEST',
  topUpLimits: { minCents: 1000, maxCents: 100000 },
  paymentsDueCount: 0,
  paymentsUpcoming: { periodStart: '', periodEnd: '', partialBrl: 0, projectedBrl: 0 }
};

const PENDING: WalletTopUpProgress = {
  balanceCents: 0,
  topUps: [
    { id: 'tu-1', amountCents: 5000, status: 'PENDING', mode: 'TEST', createdAt: '2026-11-02' }
  ]
};

describe('zs wallet', () => {
  let program: Command;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;
  const sigintListenersBefore = process.listenerCount('SIGINT');

  const printed = () => logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  const printedErrors = () => errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  const run = (...args: string[]) => program.parseAsync(['node', 'zs', 'wallet', ...args]);

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpinner.start.mockReturnValue(mockSpinner);
    mockedConfig.mockReturnValue(undefined);
    gateway.getOverview.mockResolvedValue(OVERVIEW);
    gateway.getTransactions.mockResolvedValue([]);
    gateway.startTopUp.mockResolvedValue({
      topUpId: 'tu-1',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
      mode: 'TEST'
    });
    program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => undefined, writeOut: () => undefined });
    registerWalletCommands(program);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    process.exitCode = undefined;
  });

  describe('history', () => {
    it('passes a limit within the backend range', async () => {
      await run('history', '-n', '200');
      expect(gateway.getTransactions).toHaveBeenCalledWith(200);
    });

    it.each(['201', '5000000000', '0', '1.5'])(
      'rejects --limit %s before calling the backend',
      async (limit) => {
        await expect(run('history', '-n', limit)).rejects.toThrow(/between 1 and 200/);
        expect(gateway.getTransactions).not.toHaveBeenCalled();
      }
    );
  });

  it('fails on a mistyped subcommand instead of running show', async () => {
    await expect(run('hsitory')).rejects.toThrow(/too many arguments/);
    expect(gateway.getOverview).not.toHaveBeenCalled();
  });

  describe('add', () => {
    it('refuses an API key session before any network call', async () => {
      mockedConfig.mockImplementation((key) => (key === 'authType' ? 'apikey' : undefined));

      await run('add', '50');

      expect(printedErrors()).toContain('API keys cannot move money');
      expect(printedErrors()).toContain('zs login');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(gateway.getOverview).not.toHaveBeenCalled();
      expect(gateway.startTopUp).not.toHaveBeenCalled();
    });

    it('still lets an API key session read the wallet', async () => {
      mockedConfig.mockImplementation((key) => (key === 'authType' ? 'apikey' : undefined));

      await run('show');

      expect(gateway.getOverview).toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('exits non-zero when it stops waiting without a confirmation', async () => {
      gateway.getTopUpProgress.mockResolvedValue(PENDING);

      await run('add', '50', '--no-open');

      expect(printed()).toContain('Stopped waiting after 5 minutes');
      expect(process.exitCode).toBe(1);
    });

    it('exits 0 and shows the balance when the payment is confirmed', async () => {
      gateway.getTopUpProgress.mockResolvedValue({
        balanceCents: 5000,
        topUps: [{ ...PENDING.topUps[0], status: 'COMPLETED' }]
      });

      await run('add', '50', '--no-open');

      expect(printed()).toContain('R$ 50,00');
      expect(process.exitCode).toBeUndefined();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('on Ctrl+C mid-poll, keeps its listener visible to later ones, reassures and exits 130', async () => {
      let pollStarted = () => undefined as void;
      const polling = new Promise<void>((resolve) => (pollStarted = resolve));
      gateway.getTopUpProgress.mockImplementation(() => {
        pollStarted();
        return new Promise<never>(() => undefined);
      });
      // Stands in for signal-exit, which re-raises SIGINT when it thinks it is
      // the only listener left at emit time.
      let listenersSeenAtEmit = 0;
      const lateListener = () => {
        listenersSeenAtEmit = process.listenerCount('SIGINT');
      };

      const command = run('add', '50', '--no-open');
      await polling;
      process.on('SIGINT', lateListener);
      const listenersBeforeEmit = process.listenerCount('SIGINT');
      process.emit('SIGINT');
      await command;
      process.removeListener('SIGINT', lateListener);

      expect(listenersSeenAtEmit).toBe(listenersBeforeEmit);
      expect(printed()).toContain('Stopped waiting. The credit will still land');
      expect(exitSpy).toHaveBeenCalledWith(130);
      expect(process.listenerCount('SIGINT')).toBe(sigintListenersBefore);
    });
  });
});
