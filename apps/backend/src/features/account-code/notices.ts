import { logger } from '@/util/logger.js';
import { sendAccountChangeNoticeEmail } from '@/features/mailing/mailing.repository.js';
import { sendSms } from '@/features/sms/sms.js';
import { SMS_PHONE_CHANGED_NOTICE_TEXT } from '@/features/sms/sms-text.js';
import { deliveryLogOnly } from './delivery.js';
import { maskEmail, maskPhone } from './masks.js';
import { toWhatsAppDigits } from './phone.js';

/**
 * "YOUR ACCOUNT CHANGED" — told to the contact that still reaches the real
 * owner, AFTER the change has committed.
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
  emailChanged(input: {
    oldEmail: string | null;
    newEmail: string;
    name?: string | null;
  }): Promise<void>;
  phoneChanged(input: {
    oldPhone: string | null;
    email: string | null;
    newPhone: string;
    name?: string | null;
  }): Promise<void>;
};

async function safely(label: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    logger.warn(`[account-code] ${label} notice failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function logOnlyNotice(label: string, to: string[]): boolean {
  if (!deliveryLogOnly()) return false;
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

  async emailChanged({ oldEmail, newEmail, name }) {
    if (!oldEmail) return;
    if (logOnlyNotice('email changed', [maskEmail(oldEmail)])) return;
    await safely('email changed', () =>
      sendAccountChangeNoticeEmail({
        recipientEmail: oldEmail,
        name,
        subject: 'Your InnocenZ email was changed',
        heading: 'Email changed',
        // Masked even here: this mailbox may be the one that was compromised.
        message: `The sign-in email for your InnocenZ account was changed to ${maskEmail(newEmail)}. This address will no longer sign in.`,
      }),
    );
  },

  async phoneChanged({ oldPhone, email, newPhone, name }) {
    const oldDigits = toWhatsAppDigits(oldPhone);
    const to = [oldDigits ? maskPhone(oldDigits) : null, email ? maskEmail(email) : null].filter(
      (x): x is string => Boolean(x),
    );
    if (to.length === 0) return;
    if (logOnlyNotice('phone changed', to)) return;
    await Promise.all([
      oldDigits
        ? safely('phone changed (sms)', async () => {
            const result = await sendSms({
              to: oldDigits,
              text: SMS_PHONE_CHANGED_NOTICE_TEXT,
              purpose: 'phone_changed_notice',
            });
            if (result.status === 'failed') throw new Error(result.error);
          })
        : Promise.resolve(),
      email
        ? safely('phone changed (email)', () =>
            sendAccountChangeNoticeEmail({
              recipientEmail: email,
              name,
              subject: 'Your InnocenZ phone number was changed',
              heading: 'Phone number changed',
              message: `The phone number on your InnocenZ account was changed to ${maskPhone(newPhone)}.`,
            }),
          )
        : Promise.resolve(),
    ]);
  },
};

/**
 * Fire a notice WITHOUT awaiting it — the response does not wait on SMTP — and
 * without letting its rejection escape. The call itself starts synchronously.
 */
export function fireNotice(work: () => Promise<void>): void {
  try {
    void work().catch((error: unknown) => {
      logger.warn('[account-code] notice rejected', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } catch (error) {
    logger.warn('[account-code] notice threw', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
