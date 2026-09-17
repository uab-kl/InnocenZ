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

export const ContactChangeStartSchema = z.object({
  kind: ContactKindSchema,
  value: z.string().min(1, 'Enter the new email or phone number'),
});

export const ContactChangeVerifySchema = ContactChangeStartSchema.extend({
  requestId: z.string().uuid('This change has expired — start again'),
  code,
});

export const ContactChangeResendSchema = ContactChangeStartSchema.extend({
  requestId: z.string().uuid('This change has expired — start again'),
});

export const ContactChangeConfirmSchema = ContactChangeStartSchema.extend({
  requestId: z.string().uuid('This change has expired — start again'),
  newRequestId: z.string().uuid('This code has expired — request a new one'),
  code,
});

export const ChangePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
  })
  .refine((body) => body.currentPassword !== body.newPassword, {
    message: 'New password must be different',
    path: ['newPassword'],
  });
