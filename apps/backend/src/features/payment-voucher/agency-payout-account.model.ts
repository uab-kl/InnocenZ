import { eq } from 'drizzle-orm';
import { boolean, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import { logger } from '@/util/logger';
import type { PayoutCredentials } from './payout-provider';

/**
 * WHOSE provider account pays this agency's PRs (migration 0143).
 *
 * ⚠️ THE SECRET IS NOT IN THIS TABLE. `apiKeyRef` / `apiSecretRef` hold a
 * REFERENCE — an env var name today, a secret-manager handle later — and
 * `resolveAgencyCredentials` below is the only thing that turns one into a
 * credential. A payout key can move money OUT, which is why this does not copy
 * `payment_method.gateway_token`'s plaintext-column approach.
 *
 * ⚠️ NOT a row on `payment_method`, deliberately — see 0143's header. That
 * table's "one default active row per org" IS the subscription instrument, and
 * a payout account parked there would be handed to the subscription lane as the
 * thing InnocenZ charges.
 */
export const AgencyPayoutAccountTable = MainSchema.table(
  'agency_payout_account',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => AgencyTable.id, { onDelete: 'cascade' }),
    /** Must match a name registered via `registerPayoutProvider`. */
    provider: varchar('provider', { length: 40 }).notNull(),
    /** Reference to the key, NEVER the key. */
    apiKeyRef: varchar('api_key_ref', { length: 255 }),
    apiSecretRef: varchar('api_secret_ref', { length: 255 }),
    /** The provider's id for the paying account, where they use one. */
    accountId: varchar('account_id', { length: 120 }),
    active: boolean('active').notNull().default(true),
    note: varchar('note', { length: 1000 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
  },
  (table) => [uniqueIndex('agency_payout_account_agency_idx').on(table.agencyId)],
);

export type AgencyPayoutAccountType = typeof AgencyPayoutAccountTable.$inferSelect;

/**
 * What may leave the server. The refs are omitted entirely rather than masked:
 * an env var NAME is a map to the secret, and a screen has no use for it.
 */
export type PublicAgencyPayoutAccount = {
  id: string;
  agencyId: string;
  provider: string;
  accountId: string | null;
  active: boolean;
  /** Is a key actually resolvable? The only thing a screen needs to know. */
  configured: boolean;
};

export function toPublicAgencyPayoutAccount(
  row: AgencyPayoutAccountType,
): PublicAgencyPayoutAccount {
  return {
    id: row.id,
    agencyId: row.agencyId,
    provider: row.provider,
    accountId: row.accountId,
    active: row.active,
    configured: Boolean(row.apiKeyRef && process.env[row.apiKeyRef]),
  };
}

/**
 * Turn this agency's stored REFERENCES into usable credentials, or null.
 *
 * Null means "this agency has no API payout" — the normal state, and not an
 * error: the bank-file path is fully functional without one. The caller falls
 * back to `credentialsFromEnv()` for the single-account deployment.
 *
 * A row naming a ref the environment does not carry returns null and LOGS
 * rather than throwing: a misconfigured provider must not take down the payout
 * screen, but it must not be invisible either.
 */
export async function resolveAgencyCredentials(
  agencyId: string,
): Promise<PayoutCredentials | null> {
  try {
    const [row] = await db
      .select()
      .from(AgencyPayoutAccountTable)
      .where(eq(AgencyPayoutAccountTable.agencyId, agencyId))
      .limit(1);
    if (!row || !row.active) return null;
    const apiKey = row.apiKeyRef ? process.env[row.apiKeyRef]?.trim() : undefined;
    if (!apiKey) {
      logger.warn(
        `[agencyPayoutAccount] agency ${agencyId} names provider '${row.provider}' but ` +
          `${row.apiKeyRef ?? 'no ref'} is not set in the environment — falling back.`,
      );
      return null;
    }
    return {
      provider: row.provider,
      apiKey,
      apiSecret: row.apiSecretRef ? process.env[row.apiSecretRef]?.trim() : undefined,
      accountId: row.accountId ?? undefined,
    };
  } catch (error) {
    logger.error('[agencyPayoutAccount.resolveAgencyCredentials] Error:', error);
    return null;
  }
}
