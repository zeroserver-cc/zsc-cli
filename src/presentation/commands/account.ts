import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import {
  ActiveAccount,
  getActiveAccountUseCase,
  listAccountsUseCase,
  switchAccountUseCase,
} from '../../application/usecases/AccountUseCase';
import { handleError } from '../formatting/errors';
import { getConfigValue } from '../../infrastructure/config/store';

export function formatAccountLine(active: ActiveAccount | null): string {
  return active ? `Account: @${active.username} (team role: ${active.teamRole})` : 'Account: own';
}

export function registerAccountCommands(program: Command): void {
  const account = program
    .command('account')
    .description('Manage the team accounts you can act as')
    .action(async () => {
      try {
        const active = await getActiveAccountUseCase();
        console.log(formatAccountLine(active));
      } catch (err) {
        handleError(err);
      }
    });

  account
    .command('list')
    .description('List the accounts you can act as')
    .action(async () => {
      try {
        const accounts = await listAccountsUseCase();
        const activeAccountId = getConfigValue('activeAccountId');
        const table = new Table({
          head: ['', 'Username', 'ID', 'Role'].map((h) => chalk.bold(h)),
          style: { head: [], border: [] },
        });
        for (const row of accounts) {
          // Without a stored activeAccountId the session acts as the own
          // account (the one with teamRole null).
          const isActive = activeAccountId ? row.id === activeAccountId : row.teamRole === null;
          table.push([
            isActive ? chalk.green('*') : '',
            isActive ? chalk.bold(row.username) : row.username,
            chalk.dim(row.id),
            row.teamRole ?? 'owner',
          ]);
        }
        console.log(table.toString());
      } catch (err) {
        handleError(err);
      }
    });

  account
    .command('switch')
    .description('Act as another account (team) you belong to')
    .argument('<id-or-username>', 'Account id (or unique prefix) or exact username')
    .action(async (target: string) => {
      try {
        const result = await switchAccountUseCase(target);
        const label = result.teamRole ? `team ${result.teamRole}` : 'own account';
        console.log(chalk.green('✓'), `Now acting as @${result.username} (${label})`);
      } catch (err) {
        handleError(err);
      }
    });
}
