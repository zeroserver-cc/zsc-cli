import Table from 'cli-table3';
import chalk from 'chalk';
import { brlToCents, formatBrl, formatSignedBrl } from '../../domain/money';
import { PaymentMode, WalletOverview, WalletTransaction } from '../../domain/wallet';
import { formatDate } from './dates';

export const TEST_MODE_NOTICE =
  'TEST MODE: no real money is charged (test card 4242 4242 4242 4242)';

const TYPE_LABELS: Record<WalletTransaction['type'], string> = {
  STRIPE_TOPUP: 'Top-up (card)',
  MANUAL_CREDIT: 'Manual credit',
  REVERSAL: 'Reversal'
};

export function printTestModeNotice(mode: PaymentMode): void {
  if (mode === 'TEST') console.log(chalk.yellow(TEST_MODE_NOTICE));
}

export function printWalletOverview(overview: WalletOverview): void {
  const { paymentMode, paymentsUpcoming, paymentsDueCount } = overview;
  console.log('');
  console.log(`${chalk.bold('Balance:')}  ${chalk.green(formatBrl(overview.balanceCents))}`);
  console.log(`${chalk.bold('Mode:')}     ${paymentMode}`);
  printTestModeNotice(paymentMode);
  console.log('');
  console.log(chalk.bold('Upcoming (demonstrative, nothing is debited from your wallet):'));
  console.log(`  Month so far:       ${formatBrl(brlToCents(paymentsUpcoming.partialBrl))}`);
  console.log(`  Projected to end:   ${formatBrl(brlToCents(paymentsUpcoming.projectedBrl))}`);
  console.log(`  Closed invoices:    ${paymentsDueCount}`);
  console.log('');
}

function describe(tx: WalletTransaction): string {
  return [tx.note, tx.externalReference].filter(Boolean).join(' | ') || '-';
}

export function printTransactionsTable(transactions: WalletTransaction[]): void {
  if (!transactions.length) {
    console.log(
      chalk.gray('No wallet transactions yet. Add credit with "zs wallet add <amount>".')
    );
    return;
  }

  const table = new Table({
    head: ['Date', 'Type', 'Amount', 'Note / Reference'].map((h) => chalk.bold(h)),
    style: { head: [], border: [] }
  });
  for (const tx of transactions) {
    const amount = formatSignedBrl(tx.amountCents);
    table.push([
      formatDate(tx.createdAt),
      TYPE_LABELS[tx.type] ?? tx.type,
      { content: tx.amountCents < 0 ? chalk.red(amount) : chalk.green(amount), hAlign: 'right' },
      describe(tx)
    ]);
  }
  console.log(table.toString());
}
