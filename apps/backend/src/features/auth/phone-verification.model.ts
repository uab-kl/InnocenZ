import { integer, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';

/**
 * Short-lived WhatsApp OTP proof. Migration 0084 (+ purpose in 0088).
 *
 * The plaintext code never lives here — only `code_hash` (sha256 hex). Status
 * machine: pending → verified → consumed. Expired rows stay for audit; send
 * simply stops accepting them.
 *
 * `purpose` isolates signup / forgot-password / change-phone so one flow cannot
 * consume another's receipt.
 */
export const phoneVerificationStatusValues = [
  'pending',
  'verified',
  'expired',
  'consumed',
] as const;
export type PhoneVerificationStatus = (typeof phoneVerificationStatusValues)[number];

/**
 * Every purpose a row may carry.
 *
 * The last three belong to the account-code flows (features/account-code) and
 * are NEVER accepted by the public `/auth/otp/send` and `/auth/otp/verify` —
 * those take `publicOtpPurposeValues` below. Those rows are keyed on the
 * ACCOUNT (`created_by` = its user id, the code hash bound to that id), not on
 * a phone number a stranger can type, so letting the public endpoints touch
 * them would hand a per-phone lookup to a per-account secret.
 *
 *  • `reset_password`           — logged-out reset, code to every contact on file
 *  • `contact_change_identity`  — signed-in email/phone change, step 1: a code to
 *                                 the CURRENT contacts proves it is the owner
 *  • `contact_change_new`       — step 2: a code to the NEW contact proves it works
 *
 * `change_phone` stays for the rows already stored; nothing issues it any more.
 */
export const phoneVerificationPurposeValues = [
  'signup',
  'forgot_password',
  'change_phone',
  'reset_password',
  'contact_change_identity',
  'contact_change_new',
] as const;
export type PhoneVerificationPurpose = (typeof phoneVerificationPurposeValues)[number];

/**
 * What the PUBLIC `/auth/otp/send` and `/auth/otp/verify` accept.
 *
 * `change_phone` was removed from here: changing a phone now needs a code to
 * the current contacts first (POST /auth/contact-change/start), and the old
 * one-step change answered with a code sent only to the NEW number — which
 * proves the new number works, not that the caller owns the account.
 */
export const publicOtpPurposeValues = ['signup', 'forgot_password'] as const;
export type PublicOtpPurpose = (typeof publicOtpPurposeValues)[number];

export const PhoneVerificationTable = MainSchema.table('phone_verification', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  /** Digits-only E.164-ish form (e.g. 60123456789) — matches login normalisation. */
  phoneNum: varchar('phone_num').notNull(),
  codeHash: varchar('code_hash', { length: 64 }).notNull(),
  channel: varchar('channel', { length: 20 }).notNull().default('whatsapp'),
  purpose: varchar('purpose', { length: 32 })
    .$type<PhoneVerificationPurpose>()
    .notNull()
    .default('signup'),
  status: varchar('status', { length: 20 })
    .$type<PhoneVerificationStatus>()
    .notNull()
    .default('pending'),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  /** WhatsApp Cloud API wamid, when the send succeeded. */
  waMessageId: varchar('wa_message_id', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type PhoneVerification = typeof PhoneVerificationTable.$inferSelect;
export type NewPhoneVerification = typeof PhoneVerificationTable.$inferInsert;
