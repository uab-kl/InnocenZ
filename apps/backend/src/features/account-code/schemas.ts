import { z } from 'zod';
import { storedPhone, toWhatsAppDigits } from './phone.js';

/**
 * Request bodies for the account-code endpoints.
 *
 * Password: 6-72. The upper bound is bcrypt's — it silently ignores every byte
 * past 72, so a longer password would "work" while only its first 72 bytes
 * mattered, and two different long passwords could unlock the same account.
 */

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

const password = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters long`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters long`);

const code = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');
const requestId = z.string().uuid('This code has expired — request a new one');

/**
 * The proof for every signed-in credential change — the password change, and
 * since 21 Sep 2026 starting a contact change too. ONE spelling, so both
 * endpoints refuse a missing password with the same sentence, which the web and
 * the app already translate.
 */
const currentPassword = z
  // ⚠️ The `error` argument as well as `.min()`. Without it a body with NO
  // `currentPassword` key at all raises zod's own `invalid_type` and answers
  // "Invalid input: expected string, received undefined" — a sentence no client
  // translates, shown to somebody who simply left the box empty.
  .string({ error: 'Current password is required' })
  .min(1, 'Current password is required');

const emailValue = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Enter a valid email address')
  .pipe(z.email('Enter a valid email address'));

export const ForgotStartSchema = z
  .object({
    email: z.string().optional(),
    phoneNum: z.string().optional(),
  })
  .transform((body, ctx) => {
    const email = body.email?.trim() ? body.email : undefined;
    const phoneNum = body.phoneNum?.trim() ? body.phoneNum : undefined;
    if (Boolean(email) === Boolean(phoneNum)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter your email or your phone number',
      });
      return z.NEVER;
    }
    if (email) {
      const parsed = emailValue.safeParse(email);
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid email address' });
        return z.NEVER;
      }
      return { kind: 'email' as const, value: parsed.data };
    }
    const digits = toWhatsAppDigits(phoneNum);
    if (!digits) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number' });
      return z.NEVER;
    }
    return { kind: 'phone' as const, value: digits };
  });

export const ForgotCompleteSchema = z.object({
  requestId,
  code,
  password,
});

export const ContactKindSchema = z.enum(['email', 'phone']);

/**
 * `{ kind, value }` → the value as it would be STORED: a lowercase email, or
 * '+digits'. Every contact-change step normalises the same way, so the value
 * bound into a code hash at start is byte-identical at confirm.
 */
export function normaliseContactValue(
  kind: 'email' | 'phone',
  raw: unknown,
): { ok: true; value: string } | { ok: false; message: string } {
  if (kind === 'email') {
    const parsed = emailValue.safeParse(raw);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, message: 'Enter a valid email address' };
  }
  const digits = typeof raw === 'string' ? toWhatsAppDigits(raw) : null;
  return digits
    ? { ok: true, value: storedPhone(digits) }
    : { ok: false, message: 'Enter a valid phone number' };
}

/** The change being asked for, identically shaped on all three calls. */
const contactTarget = {
  kind: ContactKindSchema,
  value: z.string().min(1, 'Enter the new email or phone number'),
};

/**
 * ⚠️ `currentPassword` is on START ONLY (owner, 21 Sep 2026). Resend and
 * confirm are reached only by a caller who already passed it and holds the
 * `requestId` it answered with, and asking again would mean the client had to
 * keep the password in memory behind the code sheet.
 */
export const ContactChangeStartSchema = z.object({ ...contactTarget, currentPassword });

export const ContactChangeResendSchema = z.object({ ...contactTarget, requestId });

export const ContactChangeConfirmSchema = z.object({ ...contactTarget, requestId, code });

/**
 * THE SIGNED-IN PASSWORD CHANGE — two steps with a code (owner, 21 Sep 2026,
 * asked directly what it should become: "Current password + a code").
 *
 *   start   { currentPassword }                  → a code to the phone AND the
 *                                                  email already on file
 *   resend  { requestId }                        → the same, sent again
 *   confirm { requestId, code, newPassword }     → written, tokens re-issued
 *
 * ⚠️ `currentPassword` is on START ONLY, exactly as the contact change has it:
 * the `requestId` is handed out only to a caller who just passed the password,
 * and asking again would mean the client holding the password in memory behind
 * the code sheet for the whole flow.
 *
 * ⚠️ There is therefore NO "new must differ from current" refine left — confirm
 * never sees the current password, so the two plaintexts cannot be compared.
 * The rule did not go away: `confirm` compares the NEW password against the
 * STORED HASH with `comparePassword` and answers the same sentence.
 */
export const PasswordChangeStartSchema = z.object({ currentPassword });

export const PasswordChangeResendSchema = z.object({ requestId });

export const PasswordChangeConfirmSchema = z.object({
  requestId,
  code,
  newPassword: password,
});
