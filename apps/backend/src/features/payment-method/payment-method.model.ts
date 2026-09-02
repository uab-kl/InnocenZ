import { MainSchema } from '@/db/db.schema';
import { boolean, smallint, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';

/**
 * How an outlet or agency pays its InnocenZ subscription. Migration 0082,
 * generalised from "the card" to "the instrument" in 0133.
 *
 * ⚠️ THE CARD NUMBER AND CVV ARE NOT HERE, AND MUST NEVER BE ADDED. A stored PAN
 * puts this database in PCI-DSS scope and a stored CVV is forbidden outright,
 * encrypted or not. This table holds only what a person needs to recognise their
 * own instrument, plus `gatewayToken` — where a real charge token goes once a
 * payment gateway is wired. Until then the app RECORDS how an org pays; it
 * cannot charge anything.
 *
 * A card is one Malaysian rail and, for business accounts, not the common one:
 * FPX direct debit runs on a bank-approved mandate, and many venues will only
 * ever bank-transfer. `type` says which rail, and the card columns are nullable
 * because a bank transfer has no expiry and no last four. What the old NOT NULLs
 * guaranteed is now a conditional CHECK (`payment_method_card_fields`) — a row
 * claiming to be a card still has to carry the card facts.
 *
 * Ownership is two nullable FKs with a CHECK that exactly one is set, not the
 * `subscriberType` + `subscriberId` pair `member_subscription` uses: that pair
 * cannot be a foreign key, which is how six ledger rows came to point at
 * organisations that never existed.
 */
export const PaymentMethodTable = MainSchema.table('payment_method', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  outletId: uuid('outlet_id').references(() => OutletTable.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id').references(() => AgencyTable.id, { onDelete: 'cascade' }),
  /** Which rail this is. Everything below is conditional on it. */
  type: varchar('type', { length: 30 }).$type<PaymentMethodType>().notNull().default('card'),
  /** Derived in the browser from the number the user typed — never sent to us. */
  brand: varchar('brand', { length: 30 }).notNull().default('Card'),
  /** Card rails only. Null on a mandate or a bank transfer. */
  last4: varchar('last4', { length: 4 }),
  expMonth: smallint('exp_month'),
  expYear: smallint('exp_year'),
  holderName: varchar('holder_name', { length: 255 }),
  billingEmail: varchar('billing_email', { length: 255 }),
  /**
   * Mandate rails only. A card works the moment it is saved; an FPX direct
   * debit does NOT until the payer's bank approves it, and code that cannot
   * see the difference will debit an account that never authorised the charge.
   */
  mandateStatus: varchar('mandate_status', { length: 20 }).$type<MandateStatus>(),
  mandateReference: varchar('mandate_reference', { length: 120 }),
  /**
   * WHICH BANK the direct debit is authorised at — never the account number.
   *
   * The payer is redirected to their own bank to authorise; the bank creates
   * the mandate and the gateway returns a token. The account number never
   * reaches this application and must never be stored, for the same reason the
   * card PAN is not here: the token is what debits, so the number is data we
   * cannot use and have no business holding.
   */
  bankCode: varchar('bank_code', { length: 50 }),
  /** Snapshotted so a renamed or delisted bank cannot blank an existing mandate. */
  bankName: varchar('bank_name', { length: 120 }),
  /**
   * Which e-wallet, by roster code (migration 0139). Deliberately NOT folded
   * into `bank_code` above: those hold PayNet FPX codes and are read back
   * through `fpxBankByCode`, and Touch 'n Go is not a bank — sharing the column
   * would make its name lie about its contents and break every lookup it exists
   * to serve.
   */
  walletProvider: varchar('wallet_provider', { length: 50 }),
  /** Null until a payment gateway is connected; this pair is what could charge. */
  gateway: varchar('gateway', { length: 50 }),
  gatewayToken: varchar('gateway_token', { length: 255 }),
  autoPay: boolean('auto_pay').notNull().default(true),
  /**
   * Which instrument gets charged when an org keeps several. Unique per org
   * among active rows — the replacement for the old "only one active row"
   * index, which is what made a second rail impossible to save at all.
   */
  isDefault: boolean('is_default').notNull().default(true),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type PaymentMethod = typeof PaymentMethodTable.$inferSelect;
export type NewPaymentMethod = typeof PaymentMethodTable.$inferInsert;

/**
 * The rails an org can pay a subscription on, and the only values the CHECK
 * constraint `payment_method_type_values` admits.
 *
 * Only `card` and `fpx_mandate` can ever be charged automatically. The rest are
 * one-off by nature — the honest pattern for them is a payment link per invoice,
 * not a stored instrument that pretends it will auto-renew. `autoPay` is
 * therefore meaningless on them, and `isChargeable` below is what says so.
 *
 * `fpx` (migration 0145) is the owner's chosen rail: one-off FPX, a link each
 * period, every Malaysian bank. It stores NOTHING about the bank — the venue
 * picks it on the provider's page at pay time — which is exactly what makes it
 * a different value from `fpx_mandate`, whose CHECKs demand a bank and a state.
 */
export const paymentMethodTypeValues = [
  'card',
  'fpx',
  'fpx_mandate',
  'ewallet',
  'duitnow',
  'manual_transfer',
] as const;
export type PaymentMethodType = (typeof paymentMethodTypeValues)[number];

/** Rails a scheduled charge could ever run on unattended. */
export const autoChargeableTypes: readonly PaymentMethodType[] = ['card', 'fpx_mandate'];

/**
 * Rails a subscriber may SAVE (owner, 2 Sep 2026): a saved method is optional
 * and means auto-debit, so only the two auto-chargeable rails can be saved.
 * The others stay in `paymentMethodTypeValues` because rows on them exist
 * (retired by 0148, still describable) and because `fpx` is how every manual
 * pay-now is recorded on the attempt ledger — a rail on an attempt, not an
 * instrument. The save schema is the door; this is the list it checks.
 */
export const savablePaymentMethodTypes = ['card', 'fpx_mandate'] as const;

/**
 * A direct debit mandate's life. `pending` is the state that matters: the row
 * exists, the venue has asked for it, and NOTHING may be debited yet.
 */
export const mandateStatusValues = ['pending', 'active', 'cancelled', 'failed'] as const;
export type MandateStatus = (typeof mandateStatusValues)[number];

/**
 * The FPX retail banks a venue can authorise a direct debit at, with the PayNet
 * codes gateways address them by.
 *
 * ONE list, exported so the browser's picker and the server's validation read
 * the same rows — two copies is how a bank ends up selectable in the UI and
 * rejected on save. Codes are PayNet's own and are what a gateway needs to
 * build the redirect; the display name is snapshotted onto the saved row
 * separately so this list can change without rewriting history.
 *
 * ⚠️ NO ACCOUNT NUMBER IS COLLECTED ANYWHERE IN THIS FLOW, and none should be.
 * The payer authorises at their bank, which is the only party that needs it.
 *
 * ⚠️ NOT `MALAYSIAN_BANKS` — DO NOT MERGE THE TWO ROSTERS.
 *
 * This list is the PAYER's inbound FPX rail (flow 1, an org paying InnocenZ):
 * internet-banking channel brands, keyed by PayNet `bank_code`, used to pick a
 * redirect bank for a direct-debit mandate.
 *
 * `apps/mobile/src/lib/malaysian-banks.ts` is the PAYEE's outbound list (flow 2,
 * an agency paying a PR by credit transfer): 28 plain institution names, and it
 * carries ten banks FPX cannot address here. Pointing either picker at the
 * other would put a channel brand into a bank upload file, or drop ten banks a
 * PR can hold an account at.
 *
 * Note also that `payment_method.bank_name` below and `user_profile.bank_name`
 * are two different facts under one column name.
 */
export const fpxBanks = [
  { code: 'MB2U0227', name: 'Maybank2u' },
  { code: 'BCBB0235', name: 'CIMB Clicks' },
  { code: 'PBB0233', name: 'Public Bank' },
  { code: 'RHB0218', name: 'RHB Now' },
  { code: 'HLB0224', name: 'Hong Leong Connect' },
  { code: 'AMBB0209', name: 'AmOnline' },
  { code: 'BIMB0340', name: 'Bank Islam' },
  { code: 'BKRM0602', name: 'Bank Rakyat' },
  { code: 'OCBC0229', name: 'OCBC Online' },
  { code: 'UOB0229', name: 'UOB Malaysia' },
  { code: 'SCB0216', name: 'Standard Chartered' },
  { code: 'ABB0233', name: 'Affin Bank' },
  { code: 'ABMB0212', name: 'Alliance Bank' },
  { code: 'BSN0601', name: 'BSN' },
  { code: 'HSBC0223', name: 'HSBC Online' },
  { code: 'KFH0346', name: 'KFH Online' },
  { code: 'BMMB0341', name: 'Bank Muamalat' },
  { code: 'AGRO01', name: 'AGRONet' },
] as const;

export type FpxBankCode = (typeof fpxBanks)[number]['code'];

/** The bank behind a code, or null when the roster no longer carries it. */
export function fpxBankByCode(code: string | null | undefined) {
  return fpxBanks.find((bank) => bank.code === code) ?? null;
}

/**
 * The e-wallets a Malaysian subscriber can say it pays from (migration 0139).
 *
 * Served to the picker from HERE rather than hardcoded in the browser, for the
 * same reason `fpxBanks` is: two copies of a roster is how a client comes to
 * offer a provider that the save then rejects.
 *
 * ⚠️ EVERY ONE OF THESE IS A PUSH RAIL. The payer approves each payment inside
 * their own wallet app, so none can be debited unattended — which is why
 * `autoChargeableTypes` below excludes `ewallet`, and why the controller forces
 * `autoPay` false on it. Saving one records an INTENTION to pay, exactly like a
 * bank transfer, and never a standing authority to take money.
 */
export const ewalletProviders = [
  { code: 'TNG', name: "Touch 'n Go eWallet" },
  { code: 'GRABPAY', name: 'GrabPay' },
  { code: 'SHOPEEPAY', name: 'ShopeePay' },
  { code: 'BOOST', name: 'Boost' },
] as const;

export type EwalletProviderCode = (typeof ewalletProviders)[number]['code'];

/** The wallet behind a code, or null when the roster no longer carries it. */
export function ewalletProviderByCode(code: string | null | undefined) {
  return ewalletProviders.find((wallet) => wallet.code === code) ?? null;
}

/**
 * Whether this instrument could actually be charged right now, were a gateway
 * connected.
 *
 * ONE function so no caller re-derives it and gets the mandate case wrong: a
 * pending FPX mandate is an active, saved, default instrument that must not be
 * debited, and that is the only place in this table where "saved" and
 * "chargeable" come apart. Returns false with no gateway token, which is every
 * row today — the app records, it does not charge.
 */
export function isChargeable(
  method: Pick<PaymentMethod, 'type' | 'status' | 'mandateStatus' | 'gatewayToken'>,
): boolean {
  if (method.status !== 'active') return false;
  if (!autoChargeableTypes.includes(method.type)) return false;
  if (method.type === 'fpx_mandate' && method.mandateStatus !== 'active') return false;
  return Boolean(method.gatewayToken);
}

/**
 * The instrument AS THE BROWSER MAY SEE IT.
 *
 * `gatewayToken` is the credential that debits the instrument — the one field
 * in this table that can actually move money — and every read path was handing
 * it to the client, because `db.select()` returns whole rows and four separate
 * lanes serialise them (`getMine`, `listMine`, the admin `list`, and the
 * invoice panel's `methods`). A token in a JSON response is a token in devtools,
 * in a HAR file, and in whatever the browser's network stack keeps.
 *
 * It is dropped here rather than in each controller ON PURPOSE: four lanes that
 * each remember to strip a field is four lanes where the fifth one forgets, and
 * this codebase has eleven recorded instances of exactly that. `gateway` stays —
 * naming the provider is useful on screen and is not a secret.
 *
 * `chargeable` rides along so the UI stops re-deriving readiness from
 * `mandateStatus === 'pending'`, which reads a CANCELLED or FAILED mandate as
 * ready. One answer, computed where the rule lives.
 *
 * ⚠️ Every new read path must go through this. Returning a raw row is the bug.
 */
export type PublicPaymentMethod = Omit<PaymentMethod, 'gatewayToken'> & {
  chargeable: boolean;
};

export function toPublicPaymentMethod(row: PaymentMethod): PublicPaymentMethod {
  const { gatewayToken: _gatewayToken, ...rest } = row;
  return { ...rest, chargeable: isChargeable(row) };
}

/** Card brands the UI derives from the leading digits. 'Card' is the fallback. */
export const cardBrandValues = [
  'Visa',
  'Mastercard',
  'Amex',
  'Discover',
  'UnionPay',
  'JCB',
  'Card',
] as const;
export type CardBrand = (typeof cardBrandValues)[number];
