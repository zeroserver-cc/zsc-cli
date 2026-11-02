export type PaymentMode = 'TEST' | 'LIVE' | 'DISABLED';

export type WalletTransactionType = 'STRIPE_TOPUP' | 'MANUAL_CREDIT' | 'REVERSAL';

export type WalletTopUpStatus = 'PENDING' | 'COMPLETED' | 'EXPIRED' | 'REJECTED';

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  /** Signed BRL cents: credits positive, reversals carry the opposite sign. */
  amountCents: number;
  note?: string | null;
  externalReference?: string | null;
  createdAt: string;
}

export interface WalletTopUp {
  id: string;
  amountCents: number;
  status: WalletTopUpStatus;
  mode: PaymentMode;
  createdAt: string;
  completedAt?: string | null;
}

export interface WalletOverview {
  balanceCents: number;
  paymentMode: PaymentMode;
  topUpLimits: { minCents: number; maxCents: number };
  /** Closed invoices. Demonstrative: nothing is debited from the wallet. */
  paymentsDueCount: number;
  paymentsUpcoming: {
    periodStart: string;
    periodEnd: string;
    partialBrl: number;
    projectedBrl: number;
  };
}

export interface WalletTopUpProgress {
  balanceCents: number;
  topUps: WalletTopUp[];
}

export interface WalletTopUpCheckout {
  topUpId: string;
  checkoutUrl: string;
  mode: PaymentMode;
}
