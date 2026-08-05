import chalk from 'chalk';
import { loginWithTokenUseCase } from '../application/usecases/LoginWithTokenUseCase';
import { profileHasSession } from '../infrastructure/config/store';
import { resolveActiveProfile } from '../infrastructure/config/profile';
import { prompt, promptPassword } from './io/prompt';
import { loginWithTwoFactor } from './loginFlow';

// Commands that must run without a session: auth management itself, local
// config, self-update and session profile management.
const SESSIONLESS_COMMANDS = new Set(['login', 'logout', 'config', 'upgrade', 'session']);

/**
 * Guarantees the resolved profile holds a credential before a command runs.
 * A profile selected via --profile/ZS_PROFILE/zs.toml may never have been
 * logged into: authenticate into it on the spot (env token in CI, interactive
 * email/password otherwise) so multi-profile directories "just work", and fail
 * fast with an actionable message when no interaction is possible.
 */
export async function ensureSession(commandName: string): Promise<void> {
  if (SESSIONLESS_COMMANDS.has(commandName)) return;

  const profile = resolveActiveProfile();
  if (profileHasSession(profile.name)) return;

  const envToken = process.env.ZS_ACCESS_TOKEN?.trim();
  if (envToken) {
    const result = await loginWithTokenUseCase(envToken, process.env.ZS_REFRESH_TOKEN?.trim() || undefined);
    console.error(
      chalk.green('✓'),
      `Authenticated as ${chalk.bold(result.user.username)} via ZS_ACCESS_TOKEN (profile "${profile.name}").`,
    );
    return;
  }

  if (!process.stdin.isTTY) {
    console.error(
      chalk.red(`Profile "${profile.name}" has no session. Run "zs login --profile ${profile.name}" first.`),
    );
    process.exit(1);
  }

  console.error(chalk.yellow(`Profile "${profile.name}" has no session yet. Log in to continue.`));
  const email = await prompt('Email: ');
  const password = await promptPassword('Password: ');
  const payload = await loginWithTwoFactor(email, password);
  console.error(
    chalk.green('✓'),
    `Logged in as ${chalk.bold(payload.user.username)} (${payload.user.role}) — session stored in profile "${profile.name}".`,
  );
}
