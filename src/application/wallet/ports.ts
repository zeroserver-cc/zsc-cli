import {
  WalletOverview,
  WalletTopUpCheckout,
  WalletTopUpProgress,
  WalletTransaction
} from '../../domain/wallet';

/** What the wallet use cases need from the backend, independent of GraphQL. */
export interface WalletGateway {
  getOverview(): Promise<WalletOverview>;
  getTransactions(limit: number): Promise<WalletTransaction[]>;
  getTopUpProgress(): Promise<WalletTopUpProgress>;
  startTopUp(amountCents: number): Promise<WalletTopUpCheckout>;
}
