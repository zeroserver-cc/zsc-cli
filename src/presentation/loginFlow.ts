import chalk from 'chalk';
import {
  InvalidTwoFactorCodeError,
  loginUseCase,
  TwoFactorRequiredError,
} from '../application/usecases/LoginUseCase';
import { AuthPayload } from '../domain/entities/types';
import { prompt } from './io/prompt';

const MAX_OTP_ATTEMPTS = 3;

// Drives the 2FA flow around loginUseCase: prompts for the code when the
// backend requires it and lets the user retry a wrong code (TOTP or recovery
// code). Every code submission, including empty answers that never reach the
// backend, counts against the same MAX_OTP_ATTEMPTS budget, so the loop is
// always bounded.
export async function loginWithTwoFactor(
  email: string,
  password: string,
  otp?: string,
): Promise<AuthPayload> {
  let totpCode = otp;
  let attempts = 0;
  for (;;) {
    try {
      return await loginUseCase(email, password, totpCode);
    } catch (err) {
      const required = err instanceof TwoFactorRequiredError;
      const invalid = err instanceof InvalidTwoFactorCodeError;
      if (!required && !invalid) throw err;

      // A submitted code the backend rejected consumed an attempt.
      if (invalid) attempts++;
      if (attempts >= MAX_OTP_ATTEMPTS) throw err;
      if (invalid) console.error(chalk.red('Invalid 2FA code. Try again.'));

      // readline's question() never resolves on a TTY-less stdin (CI,
      // /dev/null): fail fast instead of hanging forever.
      if (!process.stdin.isTTY) {
        throw new Error('2FA code required. In non-interactive environments, pass it with --otp <code>.');
      }

      const answer = (await prompt('2FA code: ')).trim();
      if (!answer) {
        // An empty answer is omitted from the mutation, so the backend would
        // answer "required" again forever. Count it as a failed attempt.
        attempts++;
        if (attempts >= MAX_OTP_ATTEMPTS) throw new TwoFactorRequiredError();
        console.error(chalk.red('2FA code cannot be empty.'));
        totpCode = undefined;
        continue;
      }
      totpCode = answer;
    }
  }
}
