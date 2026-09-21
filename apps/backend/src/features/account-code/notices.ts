import { logger } from '@/util/logger.js';
import { sendAccountChangeNoticeEmail } from '@/features/mailing/mailing.repository.js';
import { safeErrorFields } from '@/features/auth/query-error-redaction.js';
import { deliveryLogOnly } from './delivery.js';
import { maskEmail } from './masks.js';

/**
 * "YOUR ACCOUNT CHANGED" — told to the contact that still reaches the real
 * owner, AFTER the change has committed.
 *
 * ⚠️ ONE NOTICE IS LEFT: the password change. The email-changed and
 * phone-changed notices were REMOVED on 21 Sep 2026 by the owner, together with
 * the identity code — nothing at all now reaches the old phone or the old
 * email, neither a code before the change nor a word after it. The consequence
 * is recorded in contact-change.controller.ts: a contact change leaves the
 * previous contact no signal, so the password and the lockout carry that alone.
 *
 * Best-effort by contract: every function here swallows its own failure and
 * logs it. A notice that cannot be delivered must never turn a change that
 * succeeded into an error response — that is the exact shape of the bug where a
 * phone change wrote the number and then answered "Unauthorized".
 *
 * Under OTP_DELIVERY_LOG_ONLY (non-production only) notices are logged, not
 * sent, for the same reason codes are: developers share real accounts.
 */

export type AccountNotices = {
  passwordChanged(input: { email: string | null; name?: string | null }): Promise<void>;
};

async function safely(label: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    // SMTP and SMS refusals quote the recipient; masked, never raw.
    logger.warn(`[account-code] ${label} notice failed`, safeErrorFields(error));
  }
}

function logOnlyNotice(label: string, to: string[]): boolean {
  // The only notice left is an email, so it follows the email channel.
  if (!deliveryLogOnly('email')) return false;
  logger.warn(`[account-code] OTP_DELIVERY_LOG_ONLY — ${label} notice logged, not sent`, { to });
  return true;
}

export const accountNotices: AccountNotices = {
  async passwordChanged({ email, name }) {
    if (!email) return;
    if (logOnlyNotice('password changed', [maskEmail(email)])) return;
    await safely('password changed', () =>
      sendAccountChangeNoticeEmail({
        recipientEmail: email,
        name,
        subject: 'Your InnocenZ password was changed',
        heading: 'Password changed',
        message: 'The password for your InnocenZ account was just changed.',
      }),
    );
  },

};

/**
 * Fire a notice WITHOUT awaiting it — the response does not wait on SMTP — and
 * without letting its rejection escape. The call itself starts synchronously.
 */
export function fireNotice(work: () => Promise<void>): void {
  try {
    void work().catch((error: unknown) => {
      logger.warn('[account-code] notice rejected', safeErrorFields(error));
    });
  } catch (error) {
    logger.warn('[account-code] notice threw', safeErrorFields(error));
  }
}
