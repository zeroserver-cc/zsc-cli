import chalk from 'chalk';
import { UserRole } from '../../domain/entities/types';
import { getConfigArray, getConfigValue } from '../../infrastructure/config/store';

export function requireRole(allowed: UserRole[]): void {
  const token = getConfigValue('accessToken');
  if (!token) {
    console.error(chalk.red('Not logged in. Run "zs login" first.'));
    process.exit(1);
  }
  // Sessions created before multi-role support only have the scalar `role`;
  // fall back to it when the membership array is absent.
  const storedRoles = getConfigArray('roles');
  const legacyRole = getConfigValue('role') as UserRole | undefined;
  const userRoles: UserRole[] =
    storedRoles && storedRoles.length > 0 ? (storedRoles as UserRole[]) : legacyRole ? [legacyRole] : [];
  if (!userRoles.some((role) => allowed.includes(role))) {
    const rolesLabel = allowed.join(' or ');
    const detail =
      userRoles.length > 1 ? `Your roles: ${userRoles.join(', ')}` : `Your role: ${userRoles[0] ?? 'unknown'}`;
    console.error(chalk.red(`This command requires ${rolesLabel} role. ${detail}.`));
    process.exit(1);
  }
}
