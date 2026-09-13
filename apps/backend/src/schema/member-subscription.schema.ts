import { z } from 'zod';
import { billingCycleValues } from '@/features/subscription/subscription.model.js';
import {
  subscriberTypeValues,
  memberSubscriptionStatusValues,
} from '@/features/member-subscription/member-subscription.model.js';

export const CreateMemberSubscriptionSchema = z.object({
  subscriberType: z.enum(subscriberTypeValues),
  subscriberId: z.uuid(),
  subscriberName: z.string().min(1).max(255),
  subscriptionId: z.uuid().optional().nullable(),
  planName: z.string().min(1).max(255),
  amount: z.coerce.number().nonnegative(),
  billingCycle: z.enum(billingCycleValues).default('monthly'),
  currency: z.string().min(1).max(8).default('MYR'),
  status: z.enum(memberSubscriptionStatusValues).default('active'),
  startedAt: z.coerce.date().optional(),
});

export const UpdateMemberSubscriptionSchema = z.object({
  planName: z.string().min(1).max(255).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  billingCycle: z.enum(billingCycleValues).optional(),
  currency: z.string().min(1).max(8).optional(),
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
