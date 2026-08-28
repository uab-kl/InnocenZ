import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository.js';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository.js';
import { notifyMany } from '@/features/notification/notify.js';
import { SYSTEM_ACTOR } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import type { OpenedInvoice } from './subscription-invoice.repository.js';

/**
 * Module-level, the same shape `notify.ts` uses for its own repository. Both are
 * stateless database access, so a second instance costs nothing — and reaching
 * through `composition-root` from a feature file that the controller itself
 * imports would close an import cycle.
 */
const agencyMembers = new AgencyMemberRepositoryClass();
const outletMembers = new OutletMemberRepositoryClass();

/**
 * Tell an organisation that a new billing period has been opened against it.
 *
 * WHY THIS IS SHARED RATHER THAN LIVING IN THE JOB. Two doors open a period: the
 * nightly 03:00 pass, and the admin pressing "Refresh periods" on Plan Payment.
 * Putting the notice in the job would mean an admin-opened period reaches nobody
 * — which door was used would decide whether the payer was told. That is the
 * exact shape of fault this codebase keeps producing, so both callers run this.
 *
 * ONE NOTICE PER ORGANISATION, not per lane. A venue on a plan with a POS add-on
 * opens two invoices on the same night; two notices for one night's billing is
 * how a bell gets ignored. The amounts are summed and the lane count carried
 * instead.
 *
 * NEVER THROWS. Raising the bill is the job; telling someone is the courtesy,
 * and a notification that cannot be written must not fail the billing run or the
 * admin's button. Same contract as `notify` itself.
 */
export async function announceOpenedInvoices(opened: OpenedInvoice[]): Promise<number> {
  if (opened.length === 0) return 0;

  type Group = {
    subscriberType: OpenedInvoice['subscriberType'];
    subscriberId: string;
    subscriberName: string;
    /**
     * INTEGER CENTS. `amount` is numeric(12,2) over the wire, so a string, and
     * adding two of them as floats is how 6999.00 + 150.10 becomes 7149.099999.
     * The one place this figure is read is a person's notification, so it has to
     * be exact.
     */
    cents: number;
    currency: string;
    count: number;
    periodStart: string;
    periodEnd: string;
  };

  const groups = new Map<string, Group>();
  for (const row of opened) {
    const key = `${row.subscriberType}:${row.subscriberId}`;
    const parsed = Math.round(Number(row.amount) * 100);
    const cents = Number.isFinite(parsed) ? parsed : 0;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        subscriberType: row.subscriberType,
        subscriberId: row.subscriberId,
        subscriberName: row.subscriberName,
        cents,
        currency: row.currency,
        count: 1,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
      });
      continue;
    }
    existing.cents += cents;
    existing.count += 1;
    // The widest window the night opened, so a plan and an add-on billed on
    // slightly different periods are described by something true of both.
    if (row.periodStart < existing.periodStart) existing.periodStart = row.periodStart;
    if (row.periodEnd > existing.periodEnd) existing.periodEnd = row.periodEnd;
  }

  let told = 0;
  for (const group of groups.values()) {
    try {
      const members =
        group.subscriberType === 'agency'
          ? await agencyMembers.listByAgency(group.subscriberId)
          : await outletMembers.listByOutlet(group.subscriberId);

      // Finance pays it and the owner owns the relationship; nobody else on a
      // roster needs a bill. Same recipients as the weekly tier statement.
      const recipients = members
        .filter((m) => m.status === 'active')
        .filter((m) => m.subRole === 'owner' || m.subRole === 'finance')
        .map((m) => m.userId);

      if (recipients.length === 0) {
        logger.warn(
          `[subscription-invoice] ${group.subscriberName}: a period was opened but there is no ` +
            'active owner/finance member to tell',
        );
        continue;
      }

      const amount = formatMoney(group.cents, group.currency);
      const written = await notifyMany(recipients, {
        kind: 'subscription_invoice_opened',
        title: `New bill: ${amount}`,
        body:
          group.count > 1
            ? `${group.periodStart} to ${group.periodEnd}, across ${group.count} lines. ` +
              'Open Subscription to see everything still unpaid.'
            : `${group.periodStart} to ${group.periodEnd}. ` +
              'Open Subscription to see everything still unpaid.',
        payload: {
          periodStart: group.periodStart,
          periodEnd: group.periodEnd,
          // Back to a decimal string, the shape every other money field on the
          // wire uses — cents are an arithmetic detail, not an interface.
          amount: (group.cents / 100).toFixed(2),
          currency: group.currency,
          count: group.count,
        },
        actor: SYSTEM_ACTOR,
      });
      if (written > 0) told += 1;
    } catch (error) {
      logger.error(
        `[subscription-invoice] could not announce the opened period for ${group.subscriberName}:`,
        error,
      );
    }
  }
  return told;
}

/** `695000` -> `RM 6,950.00`. Thousands separated, cents always shown. */
function formatMoney(cents: number, currency: string): string {
  const symbol = currency === 'MYR' ? 'RM' : currency;
  const whole = Math.trunc(Math.abs(cents) / 100);
  const part = String(Math.abs(cents) % 100).padStart(2, '0');
  const grouped = whole.toLocaleString('en-MY');
  return `${cents < 0 ? '-' : ''}${symbol} ${grouped}.${part}`;
}
