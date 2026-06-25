import chalk from 'chalk';
import { UserRole } from '../../domain/entities/types';
import { getConfigValue } from '../../infrastructure/config/store';

export function requireRole(allowed: UserRole[]): void {
  const token = getConfigValue('token');
  if (!token) {
    console.error(chalk.red('Not logged in. Run "zs login" first.'));
    process.exit(1);
  }
  const role = getConfigValue('role') as UserRole | undefined;
  if (!role || !allowed.includes(role)) {
    const rolesLabel = allowed.join(' or ');
    console.error(chalk.red(`This command requires ${rolesLabel} role. Your role: ${role ?? 'unknown'}.`));
    process.exit(1);
  }
}
