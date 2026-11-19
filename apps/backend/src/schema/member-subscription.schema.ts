import { z } from 'zod';
import { billingCycleValues } from '@/features/subscription/subscription.model.js';
import {
  subscriberTypeValues,
  memberSubscriptionStatusValues,
} from '@/features/member-subscription/member-subscription.model.js';

/**
 * THE PLATFORM BILLS IN RINGGIT, AND ONLY RINGGIT (12 Nov 2026).
 *
 * `currency` is a free `varchar(8)` defaulting to 'MYR', and this field used to
 * be `z.string().min(1).max(8)` — so 'myr', 'RM' or 'USD' would have been
 * stored. It does not stay on one row: a lane's currency is copied onto every
 * invoice that lane raises, a mismatched code makes "pay several bills
 * together" refuse with "Mixed currencies", and the revenue summary adds every
 * amount without grouping by currency while the screens print RM. Every row
 * today is 'MYR' and every system writer defaults to it, so the input is held
 * to the one value: case and spaces are forgiven ('myr ' → 'MYR'), anything
 * else is a 400 that says why.
 *
 * Shared with outlet-transaction.schema.ts — one rule, one place.
 */
const MYR_ONLY = 'Currency must be MYR — InnocenZ bills in Malaysian ringgit only.';
export const MyrCurrencySchema = z
  .string({ error: MYR_ONLY })
  .trim()
  .toUpperCase()
  .pipe(z.literal('MYR', { error: MYR_ONLY }));

export const CreateMemberSubscriptionSchema = z.object({
  subscriberType: z.enum(subscriberTypeValues),
  subscriberId: z.uuid(),
  subscriberName: z.string().min(1).max(255),
  subscriptionId: z.uuid().optional().nullable(),
  planName: z.string().min(1).max(255),
  amount: z.coerce.number().nonnegative(),
  billingCycle: z.enum(billingCycleValues).default('monthly'),
  currency: MyrCurrencySchema.default('MYR'),
  status: z.enum(memberSubscriptionStatusValues).default('active'),
  startedAt: z.coerce.date().optional(),
});

export const UpdateMemberSubscriptionSchema = z.object({
  planName: z.string().min(1).max(255).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  billingCycle: z.enum(billingCycleValues).optional(),
  // `.optional()`, never `.default()`: an edit that does not mention currency
  // must not rewrite it.
  currency: MyrCurrencySchema.optional(),
  status: z.enum(memberSubscriptionStatusValues).optional(),
  endedAt: z.coerce.date().optional().nullable(),
  /**
   * THE DAY THE METER STARTS — correctable, at last.
   *
   * Migration 0157 made this the anchor every future period is derived from, and
   * exactly two things wrote it: `/approve` stamps it, `create()` defaults it.
   * Nothing could change it afterwards, and no screen showed it. So an org
   * approved by mistake, or approved a week after the agreement really began,
   * was anchored on a day nobody could move without SQL — and every future
   * invoice inherited it.
   *
   * ⚠️ MOVING IT RE-DATES ONLY THE PERIODS NOT YET OPENED. Invoices already
   * raised are left exactly as they are: an invoice that has been sent, and
   * perhaps paid, is a document, not a projection. Whether a correction should
   * ALSO void and re-raise the open period is a decision nobody has made — the
   * conservative half is what ships, and the admin can void an invoice by hand
   * today.
   *
   * ⚠️ NULLABLE ON PURPOSE. Null is the real state "enrolled, not yet
   * billable", so an anchor set in error can be withdrawn rather than moved to
   * another wrong day. It does not vanish quietly either: the invoice job's
   * `listApprovedWithoutBillingAnchor` reports every live org lacking one, every
   * morning.
   *
   * Admin-only, like the whole of this router (`requireAdmin`).
   */
  billingStartsAt: z.coerce.date().optional().nullable(),
});
