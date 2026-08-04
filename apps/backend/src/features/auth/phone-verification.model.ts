import { integer, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';

/**
 * Short-lived WhatsApp OTP proof for PR phone sign-up. Migration 0083.
 *
 * The plaintext code never lives here — only `code_hash` (sha256 hex). Status
 * machine: pending → verified → consumed. Expired rows stay for audit; send
 * simply stops accepting them.
 */
export const phoneVerificationStatusValues = [
  'pending',
  'verified',
  'expired',
  'consumed',
] as const;
export type PhoneVerificationStatus = (typeof phoneVerificationStatusValues)[number];

export const PhoneVerificationTable = MainSchema.table('phone_verification', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  /** Digits-only E.164-ish form (e.g. 60123456789) — matches login normalisation. */
  phoneNum: varchar('phone_num').notNull(),
  codeHash: varchar('code_hash', { length: 64 }).notNull(),
  channel: varchar('channel', { length: 20 }).notNull().default('whatsapp'),
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
