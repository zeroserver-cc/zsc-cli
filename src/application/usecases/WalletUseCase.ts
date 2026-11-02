import { assertAmountWithinLimits } from '../../domain/money';
import {
  WalletOverview,
  WalletTopUpCheckout,
  WalletTopUpStatus,
  WalletTransaction
} from '../../domain/wallet';
import { WalletGateway } from '../wallet/ports';

export const TOP_UP_POLL_INTERVAL_MS = 3_000;
export const TOP_UP_WAIT_TIMEOUT_MS = 5 * 60_000;
// A flaky network must not abort a wait that is only observing: the credit lands
// by webhook regardless. Only a streak of failures is worth surfacing.
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

export class TopUpUnavailableError extends Error {
  constructor() {
    super(
      'Top-up is not available right now: the payment gateway is not configured on this platform.'
    );
    this.name = 'TopUpUnavailableError';
  }
}

export function getWalletOverviewUseCase(gateway: WalletGateway): Promise<WalletOverview> {
  return gateway.getOverview();
}

export function getWalletHistoryUseCase(
  gateway: WalletGateway,
  limit: number
): Promise<WalletTransaction[]> {
  return gateway.getTransactions(limit);
}

/**
 * Validates the amount against the live limits and the payment mode before the
 * mutation, so a typo or a DISABLED gateway fails without creating a checkout.
 * The backend re-validates; this only saves a round trip with a clear message.
 */
export async function startWalletTopUpUseCase(
  gateway: WalletGateway,
  amountCents: number
): Promise<WalletTopUpCheckout> {
  const overview = await gateway.getOverview();
  if (overview.paymentMode === 'DISABLED') throw new TopUpUnavailableError();
  assertAmountWithinLimits(amountCents, overview.topUpLimits);
  return gateway.startTopUp(amountCents);
}

export type TopUpWaitResult =
  | { outcome: 'COMPLETED'; balanceCents: number }
  | { outcome: 'EXPIRED' }
  | { outcome: 'REJECTED' }
  | { outcome: 'TIMEOUT' }
  | { outcome: 'CANCELLED' };

export interface WaitForTopUpOptions {
  topUpId: string;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Injected so tests do not wait in real time. Must resolve early on abort. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

const TERMINAL_FAILURES: ReadonlySet<WalletTopUpStatus> = new Set(['EXPIRED', 'REJECTED']);

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Polls the wallet until the top-up leaves PENDING, the deadline passes or the
 * caller aborts. Never decides anything about the credit: that is the webhook's
 * job, so TIMEOUT and CANCELLED only mean "stopped watching".
 */
export async function waitForTopUpUseCase(
  gateway: WalletGateway,
  options: WaitForTopUpOptions
): Promise<TopUpWaitResult> {
  const {
    topUpId,
    intervalMs = TOP_UP_POLL_INTERVAL_MS,
    timeoutMs = TOP_UP_WAIT_TIMEOUT_MS,
    signal,
    sleep = abortableSleep,
    now = Date.now
  } = options;
  const deadline = now() + timeoutMs;
  let consecutiveFailures = 0;

  for (;;) {
    if (signal?.aborted) return { outcome: 'CANCELLED' };

    try {
      const progress = await gateway.getTopUpProgress();
      consecutiveFailures = 0;
      const topUp = progress.topUps.find((t) => t.id === topUpId);
      if (topUp?.status === 'COMPLETED') {
        return { outcome: 'COMPLETED', balanceCents: progress.balanceCents };
      }
      if (topUp && TERMINAL_FAILURES.has(topUp.status)) {
        return { outcome: topUp.status as 'EXPIRED' | 'REJECTED' };
      }
    } catch (err) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) throw err;
    }

    if (now() >= deadline) return { outcome: 'TIMEOUT' };
    await sleep(intervalMs, signal);
  }
}
