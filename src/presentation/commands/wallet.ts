import { Command, InvalidArgumentError } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  getWalletHistoryUseCase,
  getWalletOverviewUseCase,
  startWalletTopUpUseCase,
  TopUpWaitResult,
  waitForTopUpUseCase
} from '../../application/usecases/WalletUseCase';
import { formatBrl, parseReaisToCents } from '../../domain/money';
import { getConfigValue } from '../../infrastructure/config/store';
import { graphqlWalletGateway } from '../../infrastructure/graphql/walletGateway';
import { openInBrowser } from '../../infrastructure/system/openBrowser';
import { handleError } from '../formatting/errors';
import {
  printTestModeNotice,
  printTransactionsTable,
  printWalletOverview
} from '../formatting/wallet';

const DEFAULT_HISTORY_LIMIT = 20;
// Mirrors the backend contract (transactions(limit) accepts 1..200).
const MAX_HISTORY_LIMIT = 200;
// Conventional exit status of a process stopped by Ctrl+C (128 + SIGINT).
const SIGINT_EXIT_CODE = 130;

function parseLimit(value: string): number {
  const limit = Number(value);
  if (!/^\d+$/.test(value) || limit < 1 || limit > MAX_HISTORY_LIMIT) {
    throw new InvalidArgumentError(`Must be an integer between 1 and ${MAX_HISTORY_LIMIT}.`);
  }
  return limit;
}

// The backend refuses top-ups from API keys; failing here saves a round trip
// and tells the user how to get a session that can move money.
function assertSessionCanMoveMoney(): void {
  if (getConfigValue('authType') === 'apikey') {
    throw new Error(
      'Adding credit needs a login session; API keys cannot move money. Run "zs login" (email/password) and try again.'
    );
  }
}

function printWaitResult(result: TopUpWaitResult): void {
  switch (result.outcome) {
    case 'COMPLETED':
      console.log(
        chalk.green(`Payment confirmed. New balance: ${chalk.bold(formatBrl(result.balanceCents))}`)
      );
      return;
    case 'EXPIRED':
      console.log(chalk.yellow('The checkout expired. Nothing was credited; start a new top-up.'));
      process.exitCode = 1;
      return;
    case 'REJECTED':
      console.log(
        chalk.red(
          'The payment was rejected (amount or currency mismatch). Nothing was credited; contact support.'
        )
      );
      process.exitCode = 1;
      return;
    case 'TIMEOUT':
      console.log(
        chalk.yellow(
          'Stopped waiting after 5 minutes. If you completed the payment, the credit will still land when it is confirmed; check "zs wallet".'
        )
      );
      process.exitCode = 1;
      return;
    case 'CANCELLED':
      console.log(
        chalk.yellow(
          'Stopped waiting. The credit will still land when the payment is confirmed; check "zs wallet".'
        )
      );
      // Exit now: an abandoned poll request would keep the process alive until its HTTP timeout.
      process.exit(SIGINT_EXIT_CODE);
  }
}

// Ctrl+C aborts the wait instead of killing the process mid-poll, so the user
// gets the reassurance that the credit does not depend on this CLI staying up.
// `on`, not `once`: ora's signal-exit re-raises SIGINT when it sees itself as
// the only listener, and a `once` handler is already gone by the time it looks.
async function waitUntilSettled(topUpId: string): Promise<TopUpWaitResult> {
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.on('SIGINT', onSigint);
  // discardStdin off: ora's stdin discarder would put the TTY in raw mode and swallow Ctrl+C.
  const spinner = ora({
    text: 'Waiting for payment confirmation... (Ctrl+C to stop waiting)',
    discardStdin: false
  }).start();
  try {
    return await waitForTopUpUseCase(graphqlWalletGateway, { topUpId, signal: controller.signal });
  } finally {
    spinner.stop();
    process.removeListener('SIGINT', onSigint);
  }
}

export function registerWalletCommands(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Account wallet: balance, history and card top-up');

  wallet
    .command('show', { isDefault: true })
    .description('Show balance, payment mode and upcoming (demonstrative) amounts')
    // Without this a mistyped subcommand (`zs wallet hsitory`) silently runs `show`.
    .allowExcessArguments(false)
    .action(async () => {
      const spinner = ora('Fetching wallet...').start();
      try {
        const overview = await getWalletOverviewUseCase(graphqlWalletGateway);
        spinner.stop();
        printWalletOverview(overview);
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });

  wallet
    .command('history')
    .description('List wallet transactions, newest first')
    .allowExcessArguments(false)
    .option(
      '-n, --limit <n>',
      `Number of transactions to show (1-${MAX_HISTORY_LIMIT})`,
      parseLimit,
      DEFAULT_HISTORY_LIMIT
    )
    .action(async (opts: { limit: number }) => {
      const spinner = ora('Fetching transactions...').start();
      try {
        const transactions = await getWalletHistoryUseCase(graphqlWalletGateway, opts.limit);
        spinner.stop();
        printTransactionsTable(transactions);
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });

  wallet
    .command('add <amount>')
    .description(
      'Add credit by card via Stripe Checkout. Amount in reais: 50, 50.00 or 50,00 (needs a login session, not an API key)'
    )
    .allowExcessArguments(false)
    .option('--no-wait', 'Do not wait for the payment confirmation')
    .option('--no-open', 'Do not open the checkout page in the browser')
    .action(async (amount: string, opts: { wait: boolean; open: boolean }) => {
      try {
        const amountCents = parseReaisToCents(amount);
        assertSessionCanMoveMoney();
        const checkout = await startWalletTopUpUseCase(graphqlWalletGateway, amountCents);

        console.log(`Top-up of ${chalk.bold(formatBrl(amountCents))} started.`);
        printTestModeNotice(checkout.mode);
        console.log(`Checkout: ${chalk.underline(checkout.checkoutUrl)}`);
        if (opts.open && process.stdout.isTTY && (await openInBrowser(checkout.checkoutUrl))) {
          console.log(chalk.gray('Opened in your browser.'));
        }
        if (!opts.wait) {
          console.log(
            chalk.gray('The credit lands when the payment is confirmed; check "zs wallet".')
          );
          return;
        }
        printWaitResult(await waitUntilSettled(checkout.topUpId));
      } catch (err) {
        handleError(err);
      }
    });
}
