import { WalletGateway } from '../../wallet/ports';
import {
  TopUpUnavailableError,
  startWalletTopUpUseCase,
  waitForTopUpUseCase
} from '../WalletUseCase';
import { PaymentMode, WalletTopUp, WalletTopUpStatus } from '../../../domain/wallet';

const OVERVIEW = {
  balanceCents: 0,
  paymentMode: 'TEST' as PaymentMode,
  topUpLimits: { minCents: 1000, maxCents: 100000 },
  paymentsDueCount: 0,
  paymentsUpcoming: { periodStart: '', periodEnd: '', partialBrl: 0, projectedBrl: 0 }
};

function topUp(id: string, status: WalletTopUpStatus): WalletTopUp {
  return { id, amountCents: 5000, status, mode: 'TEST', createdAt: '2026-11-02T10:00:00Z' };
}

function fakeGateway(overrides: Partial<WalletGateway> = {}): jest.Mocked<WalletGateway> {
  return {
    getOverview: jest.fn().mockResolvedValue(OVERVIEW),
    getTransactions: jest.fn().mockResolvedValue([]),
    getTopUpProgress: jest.fn().mockResolvedValue({ balanceCents: 0, topUps: [] }),
    startTopUp: jest.fn().mockResolvedValue({
      topUpId: 'tu-1',
      checkoutUrl: 'https://checkout.stripe.com/x',
      mode: 'TEST'
    }),
    ...overrides
  } as jest.Mocked<WalletGateway>;
}

describe('startWalletTopUpUseCase', () => {
  it('calls the mutation with integer cents when within limits', async () => {
    const gateway = fakeGateway();
    const checkout = await startWalletTopUpUseCase(gateway, 5000);
    expect(gateway.startTopUp).toHaveBeenCalledWith(5000);
    expect(checkout.topUpId).toBe('tu-1');
  });

  it.each([999, 100001, 0, -5])('rejects %i before calling the mutation', async (cents) => {
    const gateway = fakeGateway();
    await expect(startWalletTopUpUseCase(gateway, cents)).rejects.toThrow(/Amount must be/);
    expect(gateway.startTopUp).not.toHaveBeenCalled();
  });

  it('fails clearly when the gateway mode is DISABLED', async () => {
    const gateway = fakeGateway({
      getOverview: jest.fn().mockResolvedValue({ ...OVERVIEW, paymentMode: 'DISABLED' })
    });
    await expect(startWalletTopUpUseCase(gateway, 5000)).rejects.toBeInstanceOf(
      TopUpUnavailableError
    );
    expect(gateway.startTopUp).not.toHaveBeenCalled();
  });
});

describe('waitForTopUpUseCase', () => {
  function clock() {
    let t = 0;
    return {
      now: () => t,
      sleep: jest.fn(async (ms: number) => {
        t += ms;
      })
    };
  }

  it('returns COMPLETED with the new balance after a few PENDING polls', async () => {
    const { now, sleep } = clock();
    const getTopUpProgress = jest
      .fn()
      .mockResolvedValueOnce({ balanceCents: 0, topUps: [topUp('tu-1', 'PENDING')] })
      .mockResolvedValueOnce({ balanceCents: 0, topUps: [topUp('tu-1', 'PENDING')] })
      .mockResolvedValueOnce({ balanceCents: 5000, topUps: [topUp('tu-1', 'COMPLETED')] });
    const gateway = fakeGateway({ getTopUpProgress });

    const result = await waitForTopUpUseCase(gateway, { topUpId: 'tu-1', now, sleep });

    expect(result).toEqual({ outcome: 'COMPLETED', balanceCents: 5000 });
    expect(getTopUpProgress).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000, undefined);
  });

  it.each(['EXPIRED', 'REJECTED'] as const)('returns %s', async (status) => {
    const { now, sleep } = clock();
    const gateway = fakeGateway({
      getTopUpProgress: jest
        .fn()
        .mockResolvedValue({ balanceCents: 0, topUps: [topUp('tu-1', status)] })
    });
    expect(await waitForTopUpUseCase(gateway, { topUpId: 'tu-1', now, sleep })).toEqual({
      outcome: status
    });
  });

  it('ignores other top-ups and keeps waiting for the requested one', async () => {
    const { now, sleep } = clock();
    const getTopUpProgress = jest
      .fn()
      .mockResolvedValueOnce({
        balanceCents: 1000,
        topUps: [topUp('other', 'COMPLETED'), topUp('tu-1', 'PENDING')]
      })
      .mockResolvedValueOnce({ balanceCents: 6000, topUps: [topUp('tu-1', 'COMPLETED')] });
    const gateway = fakeGateway({ getTopUpProgress });

    const result = await waitForTopUpUseCase(gateway, { topUpId: 'tu-1', now, sleep });

    expect(result).toEqual({ outcome: 'COMPLETED', balanceCents: 6000 });
  });

  it('times out when the top-up stays PENDING past the deadline', async () => {
    const { now, sleep } = clock();
    const gateway = fakeGateway({
      getTopUpProgress: jest
        .fn()
        .mockResolvedValue({ balanceCents: 0, topUps: [topUp('tu-1', 'PENDING')] })
    });

    const result = await waitForTopUpUseCase(gateway, {
      topUpId: 'tu-1',
      timeoutMs: 9000,
      intervalMs: 3000,
      now,
      sleep
    });

    expect(result).toEqual({ outcome: 'TIMEOUT' });
    expect(gateway.getTopUpProgress).toHaveBeenCalledTimes(4);
  });

  it('returns CANCELLED when aborted during the wait, without another poll', async () => {
    const controller = new AbortController();
    const sleep = jest.fn(async () => controller.abort());
    const gateway = fakeGateway({
      getTopUpProgress: jest
        .fn()
        .mockResolvedValue({ balanceCents: 0, topUps: [topUp('tu-1', 'PENDING')] })
    });

    const result = await waitForTopUpUseCase(gateway, {
      topUpId: 'tu-1',
      signal: controller.signal,
      sleep
    });

    expect(result).toEqual({ outcome: 'CANCELLED' });
    expect(gateway.getTopUpProgress).toHaveBeenCalledTimes(1);
  });

  it('survives isolated polling failures but gives up after three in a row', async () => {
    const { now, sleep } = clock();
    const flaky = fakeGateway({
      getTopUpProgress: jest
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ balanceCents: 5000, topUps: [topUp('tu-1', 'COMPLETED')] })
    });
    expect(await waitForTopUpUseCase(flaky, { topUpId: 'tu-1', now, sleep })).toEqual({
      outcome: 'COMPLETED',
      balanceCents: 5000
    });

    const dead = fakeGateway({
      getTopUpProgress: jest.fn().mockRejectedValue(new Error('backend down'))
    });
    await expect(waitForTopUpUseCase(dead, { topUpId: 'tu-1', now, sleep })).rejects.toThrow(
      'backend down'
    );
    expect(dead.getTopUpProgress).toHaveBeenCalledTimes(3);
  });
});
