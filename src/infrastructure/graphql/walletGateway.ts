import { WalletGateway } from '../../application/wallet/ports';
import {
  PaymentMode,
  WalletOverview,
  WalletTopUpCheckout,
  WalletTopUpProgress,
  WalletTransaction
} from '../../domain/wallet';
import { gqlRequest } from './client';
import {
  START_WALLET_TOPUP_MUTATION,
  WALLET_OVERVIEW_QUERY,
  WALLET_TOPUP_PROGRESS_QUERY,
  WALLET_TRANSACTIONS_QUERY
} from './queries';

interface WalletOverviewResponse {
  wallet: {
    balanceCents: number;
    paymentMode: PaymentMode;
    topUpLimits: { minCents: number; maxCents: number };
    paymentsDue: Array<{ invoiceId: string }>;
    paymentsUpcoming: WalletOverview['paymentsUpcoming'];
  };
}

export const graphqlWalletGateway: WalletGateway = {
  async getOverview() {
    const { wallet } = await gqlRequest<WalletOverviewResponse>(WALLET_OVERVIEW_QUERY);
    return {
      balanceCents: wallet.balanceCents,
      paymentMode: wallet.paymentMode,
      topUpLimits: wallet.topUpLimits,
      paymentsDueCount: wallet.paymentsDue.length,
      paymentsUpcoming: wallet.paymentsUpcoming
    };
  },

  async getTransactions(limit) {
    const data = await gqlRequest<{ wallet: { transactions: WalletTransaction[] } }>(
      WALLET_TRANSACTIONS_QUERY,
      { limit }
    );
    return data.wallet.transactions;
  },

  async getTopUpProgress() {
    const data = await gqlRequest<{ wallet: WalletTopUpProgress }>(WALLET_TOPUP_PROGRESS_QUERY);
    return data.wallet;
  },

  async startTopUp(amountCents) {
    const data = await gqlRequest<{ startWalletTopUp: WalletTopUpCheckout }>(
      START_WALLET_TOPUP_MUTATION,
      { amountCents }
    );
    return data.startWalletTopUp;
  }
};
