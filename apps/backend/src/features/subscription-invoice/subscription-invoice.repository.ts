import { and, desc, eq, gte, ilike, inArray, lte, or, sql, SQL } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';
import { MemberSubscriptionTable } from '@/features/member-subscription/member-subscription.model.js';
import { SubscriptionTable } from '@/features/subscription/subscription.model.js';
import { klToday } from '@/features/payment-voucher/payment-voucher-week.js';
import { billingPeriodsFor, klDayOf } from './subscription-period.js';
import {
  SubscriptionInvoice,
  SubscriptionInvoiceFilter,
  SubscriptionInvoiceInsertType,
  SubscriptionInvoiceTable,
  SubscriptionInvoiceWithSubscriber,
} from './subscription-invoice.model.js';

/** The subscriber columns every read carries, FK-joined rather than duplicated. */
const SUBSCRIBER_COLUMNS = {
  subscriberType: MemberSubscriptionTable.subscriberType,
  subscriberId: MemberSubscriptionTable.subscriberId,
  subscriberName: MemberSubscriptionTable.subscriberName,
  planName: MemberSubscriptionTable.planName,
  billingCycle: MemberSubscriptionTable.billingCycle,
};

/**
 * One billing period the ledger has just opened, handed back so the caller can
 * tell the organisation it was raised against.
 *
 * Returned rather than notified from inside `generateMissing`, deliberately: the
 * period job and the admin's "Refresh periods" button both open periods, and a
 * repository that announced its own writes would still leave the two callers
 * free to disagree about everything else. One shared announcer over this array
 * is what keeps them the same.
 */
export type OpenedInvoice = {
  subscriberType: SubscriptionInvoiceWithSubscriber['subscriberType'];
  subscriberId: string;
  /** Snapshotted on member_subscription; used for the log line, not the notice. */
  subscriberName: string;
  /** Calendar days, YYYY-MM-DD — a billing period has no time of day. */
  periodStart: string;
  periodEnd: string;
  /** numeric(12,2), so a string. */
  amount: string;
  currency: string;
};

type JoinedRow = {
  invoice: SubscriptionInvoice;
  subscriberType: SubscriptionInvoiceWithSubscriber['subscriberType'];
  subscriberId: string;
  subscriberName: string;
  planName: string;
  billingCycle: string;
};

function flatten(row: JoinedRow): SubscriptionInvoiceWithSubscriber {
  return {
    ...row.invoice,
    subscriberType: row.subscriberType,
    subscriberId: row.subscriberId,
    subscriberName: row.subscriberName,
    planName: row.planName,
    billingCycle: row.billingCycle,
  };
}

export class SubscriptionInvoiceRepositoryClass {
  /**
   * Every condition is expressed against the JOINED pair, because the fields a
   * caller filters on (who the subscriber is) live on `member_subscription`
   * while the ones it sorts on live here. Filtering on a copy kept in this table
   * is exactly the duplication the schema avoids.
   */
  private buildConditions(filter?: SubscriptionInvoiceFilter): SQL | undefined {
    const conditions: SQL[] = [];
    if (filter?.subscriberType) {
      conditions.push(eq(MemberSubscriptionTable.subscriberType, filter.subscriberType));
    }
    if (filter?.subscriberId) {
      conditions.push(eq(MemberSubscriptionTable.subscriberId, filter.subscriberId));
    }
    if (filter?.memberSubscriptionId) {
      conditions.push(eq(SubscriptionInvoiceTable.memberSubscriptionId, filter.memberSubscriptionId));
    }
    if (filter?.status) {
      conditions.push(eq(SubscriptionInvoiceTable.status, filter.status));
    }
    if (filter?.search) {
      conditions.push(ilike(MemberSubscriptionTable.subscriberName, `%${filter.search}%`));
    }
    if (filter?.dates && filter.dates.length > 0) {
      const dayClauses = filter.dates.map((day) => eq(SubscriptionInvoiceTable.periodStart, day));
      const combined = dayClauses.length === 1 ? dayClauses[0] : or(...dayClauses);
      if (combined) conditions.push(combined);
    } else {
      if (filter?.from) conditions.push(gte(SubscriptionInvoiceTable.periodStart, filter.from));
      if (filter?.to) conditions.push(lte(SubscriptionInvoiceTable.periodStart, filter.to));
    }
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  async listPaginated(params: {
    filter?: SubscriptionInvoiceFilter;
    page: number;
    pageSize: number;
  }): Promise<{ records: SubscriptionInvoiceWithSubscriber[]; totalCount: number }> {
    try {
      const { filter, page, pageSize } = params;
      const whereClause = this.buildConditions(filter);

      const [countRow] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(SubscriptionInvoiceTable)
        .innerJoin(
          MemberSubscriptionTable,
          eq(SubscriptionInvoiceTable.memberSubscriptionId, MemberSubscriptionTable.id),
        )
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const rows = await db
        .select({ invoice: SubscriptionInvoiceTable, ...SUBSCRIBER_COLUMNS })
        .from(SubscriptionInvoiceTable)
        .innerJoin(
          MemberSubscriptionTable,
          eq(SubscriptionInvoiceTable.memberSubscriptionId, MemberSubscriptionTable.id),
        )
        .where(whereClause)
        .orderBy(
          desc(SubscriptionInvoiceTable.periodStart),
          desc(SubscriptionInvoiceTable.createdAt),
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { records: rows.map(flatten), totalCount };
    } catch (error) {
      logger.error('[SubscriptionInvoiceRepository.listPaginated] Error:', error);
      return { records: [], totalCount: 0 };
    }
  }

  /**
   * One entry per ORG, carrying every invoice it holds — plan, Custom and the
   * POS add-on together.
   *
   * ⚠️ PAGINATED BY SUBSCRIBER, NOT BY INVOICE, and that is the whole point.
   * Grouping `listPaginated`'s ten rows in the browser would have produced
   * confident half-groups: Atlas holds three periods, and on a page that
   * happened to carry one of them the card would have read "1 period,
   * RM 9,999" under a heading claiming to be everything that org owes. A
   * summary that silently omits rows is worse than the flat list it replaces,
   * because it looks like an answer.
   *
   * So the subscribers are selected and paged FIRST, then every invoice
   * belonging to them is fetched whole. Two queries, and each org on the page
   * is complete by construction.
   *
   * Grouped on `subscriberId`, never on the name: a rename would split one org
   * into two cards, and two orgs sharing a name would merge into one. An org
   * may hold several `member_subscription` rows — its plan, and an add-on
   * beside it — and collapsing those into one card is exactly what was asked
   * for; the lanes stay legible as separate invoices inside it.
   */
  async listGroupedBySubscriber(params: {
    filter?: SubscriptionInvoiceFilter;
    page: number;
    pageSize: number;
  }): Promise<{
    groups: Array<{
      subscriberType: SubscriptionInvoiceWithSubscriber['subscriberType'];
      subscriberId: string;
      subscriberName: string;
      invoices: SubscriptionInvoiceWithSubscriber[];
    }>;
    totalCount: number;
  }> {
    try {
      const { filter, page, pageSize } = params;
      const whereClause = this.buildConditions(filter);

      // How many ORGS match — the denominator the pager counts in.
      const [countRow] = await db
        .select({
          value: sql<number>`count(distinct ${MemberSubscriptionTable.subscriberId})::int`,
        })
        .from(SubscriptionInvoiceTable)
        .innerJoin(
          MemberSubscriptionTable,
          eq(SubscriptionInvoiceTable.memberSubscriptionId, MemberSubscriptionTable.id),
        )
        .where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);
      if (totalCount === 0) return { groups: [], totalCount: 0 };

      /*
       * The page of orgs. Ordered by their most recent period so live billing
       * leads, with the id as a tie-break — without a total order two orgs
       * whose newest period falls on the same day could swap places between
       * page 1 and page 2, and one of them would never be shown at all.
       */
      const subscriberPage = await db
        .select({
          subscriberId: MemberSubscriptionTable.subscriberId,
          latest: sql<string>`max(${SubscriptionInvoiceTable.periodStart})`,
        })
        .from(SubscriptionInvoiceTable)
        .innerJoin(
          MemberSubscriptionTable,
          eq(SubscriptionInvoiceTable.memberSubscriptionId, MemberSubscriptionTable.id),
        )
        .where(whereClause)
        .groupBy(MemberSubscriptionTable.subscriberId)
        .orderBy(
          sql`max(${SubscriptionInvoiceTable.periodStart}) desc`,
          sql`${MemberSubscriptionTable.subscriberId} asc`,
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const ids = subscriberPage
        .map((row) => row.subscriberId)
        .filter((id): id is string => Boolean(id));
      if (ids.length === 0) return { groups: [], totalCount };

      /*
       * Every invoice for those orgs, under the SAME filter. Re-applying it
       * matters: a status filter of "unpaid" must not hand a card its paid
       * periods as well, or the card's total would answer a question nobody
       * asked.
       */
      const rows = await db
        .select({ invoice: SubscriptionInvoiceTable, ...SUBSCRIBER_COLUMNS })
        .from(SubscriptionInvoiceTable)
        .innerJoin(
          MemberSubscriptionTable,
          eq(SubscriptionInvoiceTable.memberSubscriptionId, MemberSubscriptionTable.id),
        )
        .where(
          whereClause
            ? and(whereClause, inArray(MemberSubscriptionTable.subscriberId, ids))
            : inArray(MemberSubscriptionTable.subscriberId, ids),
        )
        .orderBy(
          desc(SubscriptionInvoiceTable.periodStart),
          desc(SubscriptionInvoiceTable.createdAt),
        );

      // Seeded in the page's own order so the response preserves it — a Map
      // keyed as rows arrive would re-order the page by whichever org happened
      // to own the newest invoice.
      const byId = new Map<string, (typeof rows)[number][]>(ids.map((id) => [id, []]));
      for (const row of rows) {
        byId.get(row.subscriberId)?.push(row);
      }

      const groups = ids
        .map((id) => {
          const held = byId.get(id) ?? [];
          const first = held[0];
          if (!first) return null;
          return {
            subscriberType: first.subscriberType,
            subscriberId: id,
            subscriberName: first.subscriberName,
            invoices: held.map(flatten),
          };
        })
        .filter((group): group is NonNullable<typeof group> => group !== null);

      return { groups, totalCount };
    } catch (error) {
      logger.error('[SubscriptionInvoiceRepository.listGroupedBySubscriber] Error:', error);
      return { groups: [], totalCount: 0 };
    }
  }

  async getById(id: string): Promise<SubscriptionInvoiceWithSubscriber | null> {
    try {
      const [row] = await db
        .select({ invoice: SubscriptionInvoiceTable, ...SUBSCRIBER_COLUMNS })
        .from(SubscriptionInvoiceTable)
        .innerJoin(
          MemberSubscriptionTable,
          eq(SubscriptionInvoiceTable.memberSubscriptionId, MemberSubscriptionTable.id),
        )
        .where(eq(SubscriptionInvoiceTable.id, id))
        .limit(1);
      return row ? flatten(row) : null;
    } catch (error) {
      logger.error('[SubscriptionInvoiceRepository.getById] Error:', error);
      return null;
    }
  }

  async update(
    id: string,
    data: Partial<SubscriptionInvoiceInsertType>,
    tx?: DbTransaction,
  ): Promise<SubscriptionInvoice | null> {
    try {
      const dbClient = tx ?? db;
      const [record] = await dbClient
        .update(SubscriptionInvoiceTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(SubscriptionInvoiceTable.id, id))
        .returning();
      return record ?? null;
    } catch (error) {
      logger.error('[SubscriptionInvoiceRepository.update] Error:', error);
      return null;
    }
  }

  /**
   * Write an invoice row for every billing period that has been reached and does
   * not have one yet.
   *
   * SAFE TO RE-RUN, and that property is load-bearing: the unique index on
   * (member_subscription_id, period_start) plus `onConflictDoNothing` means a
   * second run — a cron tick, an admin pressing the button, a restart — inserts
   * nothing rather than billing a period twice. The weekly payout job's own
   * generator makes the same promise for the same reason, and the one row this
   * app has ever double-billed got there because its week key did not line up
   * with the rule that generated it.
   *
   * Reads `member_subscription` directly rather than through its repository: the
   * only thing needed is the billing columns, and taking that dependency would
   * add a feature-to-feature edge for nothing.
   */
  async generateMissing(params?: {
    actor?: string;
    memberSubscriptionIds?: string[];
    today?: string;
  }): Promise<{ scanned: number; created: number; opened: OpenedInvoice[] }> {
    try {
      const actor = params?.actor ?? 'system';
      const today = params?.today ?? klToday();

      const subscriptions = await db
        .select({
          id: MemberSubscriptionTable.id,
          subscriberType: MemberSubscriptionTable.subscriberType,
          subscriberId: MemberSubscriptionTable.subscriberId,
          // Carried only so an opened period can be logged as "JK House" rather
          // than a uuid; the notice itself is addressed to that org's own people
          // and never prints their own name back at them.
          subscriberName: MemberSubscriptionTable.subscriberName,
          subscriptionId: MemberSubscriptionTable.subscriptionId,
          kind: SubscriptionTable.kind,
          amount: MemberSubscriptionTable.amount,
          currency: MemberSubscriptionTable.currency,
          billingCycle: MemberSubscriptionTable.billingCycle,
          startedAt: MemberSubscriptionTable.startedAt,
          endedAt: MemberSubscriptionTable.endedAt,
          // Read beside endedAt so a lane that was cancelled WITHOUT an end date
          // is not billed forever — see stillSubscribed below.
          status: MemberSubscriptionTable.status,
        })
        .from(MemberSubscriptionTable)
        .leftJoin(SubscriptionTable, eq(MemberSubscriptionTable.subscriptionId, SubscriptionTable.id))
        .where(
          params?.memberSubscriptionIds && params.memberSubscriptionIds.length > 0
            ? inArray(MemberSubscriptionTable.id, params.memberSubscriptionIds)
            : undefined,
        );

      /**
       * ONE CHARGE PER ORG PER LANE PER PERIOD.
       *
       * Generating straight from subscription rows bills an org once for every
       * plan it held during a period — the first live run produced FOUR invoices
       * for Atlas Agency in the week of 2 Aug (Starter, Growth, Starter, Custom)
       * because it changed tier four times that week. Nobody owes four weekly
       * fees for one week.
       *
       * A "lane" is what is separately payable: the org's PLAN, and each ADD-ON
       * (the outlet's POS integration) alongside it. POS is billed on top of the
       * plan by design, so it must survive this collapse — which is why the lane
       * key carries the add-on's product id instead of lumping every row
       * together.
       *
       * Within a lane the LAST subscription to start in that period wins: the
       * tier the org settled on, which is also the one its Current subscription
       * card shows.
       */
      type BillableSubscription = (typeof subscriptions)[number];
      const laneOf = (row: BillableSubscription) =>
        [
          row.subscriberType,
          row.subscriberId,
          row.kind === 'addon' ? `addon:${row.subscriptionId}` : 'plan',
        ].join('|');

      // A row that ended on the KL day it started is a plan-switch artefact, not
      // something anyone held — dropped before it can anchor anything.
      const lanes = new Map<string, BillableSubscription[]>();
      for (const subscription of subscriptions) {
        const startDay = klDayOf(subscription.startedAt);
        const endDay = subscription.endedAt ? klDayOf(subscription.endedAt) : null;
        if (endDay !== null && endDay <= startDay) continue;
        const key = laneOf(subscription);
        const held = lanes.get(key);
        if (held) held.push(subscription);
        else lanes.set(key, [subscription]);
      }

      const winners = new Map<
        string,
        { row: BillableSubscription; period: { periodStart: string; periodEnd: string } }
      >();
      for (const [lane, rowsInLane] of lanes) {
        const ordered = [...rowsInLane].sort(
          (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
        );
        const anchor = ordered[0];
        const latest = ordered[ordered.length - 1];
        if (!anchor || !latest) continue;

        // ONE BILLING CALENDAR PER LANE, anchored on the day the org first
        // subscribed in it. Anchoring per subscription row instead opened a
        // SECOND calendar every time a venue switched mid-month: Emhub Testing
        // came out billed 3 Aug–2 Sep for Scale *and* 4 Aug–3 Sep for
        // Enterprise, two overlapping months for one venue, with its POS add-on
        // charged twice over the same days.
        /**
         * STILL ON THE LANE means an OPEN row that is also still a
         * subscription. Testing `endedAt === null` alone read the date and
         * ignored the word beside it: `PUT /member-subscription/:id` accepts
         * `status` and `endedAt` independently (member-subscription.schema.ts
         * :26-27), so an admin setting a row to `cancelled` without also
         * stamping a date leaves it open forever — and this lane went on
         * opening an invoice against it every morning. The dedicated `cancel`
         * endpoint does stamp `endedAt`, which is why the gap stays invisible
         * until someone edits the row instead of cancelling it.
         *
         * `past_due` counts as still subscribed on purpose: an org behind on
         * payment has not left, and it is exactly the one that must keep being
         * invoiced.
         */
        const stillSubscribed = ordered.some(
          (row) => row.endedAt === null && (row.status === 'active' || row.status === 'past_due'),
        );

        // A LANE THE ORG HAS LEFT IS NOT BILLED. Its periods are history, and
        // history is not a debt — an agency that dropped a tier in July does not
        // owe for it now, and every ended row here is the far side of a plan
        // switch rather than a subscription anyone is still on.
        if (!stillSubscribed) continue;
        const lastEnded = stillSubscribed
          ? null
          : ordered.reduce<Date | null>(
              (latestEnd, row) =>
                row.endedAt && (!latestEnd || row.endedAt > latestEnd) ? row.endedAt : latestEnd,
              null,
            );

        const periods = billingPeriodsFor({
          billingCycle: latest.billingCycle,
          startedAt: anchor.startedAt,
          endedAt: lastEnded,
          today,
        });

        // ONLY THE PERIOD THAT IS RUNNING NOW.
        //
        // The walk above exists to place that period on the org's own calendar
        // (a month anchored on the 31st has to be stepped from the anchor, not
        // guessed from today), but only its last entry is billed. Opening every
        // period back to the subscription's start invented a backlog: an agency
        // that switched tier three times in July got a column of unpaid weeks
        // nobody had ever raised, for plans it was no longer on. The ledger
        // starts when it starts, and grows one period at a time from the daily
        // job — so history here is what this app actually billed, not a
        // reconstruction of what it might have.
        const current = periods[periods.length - 1];
        if (!current) continue;

        // Priced by the subscription actually LIVE in that period — the last one
        // to start within it, which is the tier the org settled on and the one
        // its Current subscription card shows.
        const live =
          [...ordered]
            .reverse()
            .find(
              (row) =>
                klDayOf(row.startedAt) <= current.periodEnd &&
                (!row.endedAt || klDayOf(row.endedAt) > current.periodStart),
            ) ?? latest;
        winners.set(`${lane}|${current.periodStart}`, { row: live, period: current });
      }

      /**
       * A period already billed is left exactly as it was.
       *
       * The unique index only stops the SAME subscription being billed twice for
       * a period; it cannot see that a later switch belongs to the same lane. So
       * a plan changed after the invoice was opened must not add a second charge
       * for that week — the ledger's first answer for a period stands, and an
       * admin who disagrees edits it rather than being handed two rows.
       */
      const existing = await db
        .select({
          subscriberType: MemberSubscriptionTable.subscriberType,
          subscriberId: MemberSubscriptionTable.subscriberId,
          subscriptionId: MemberSubscriptionTable.subscriptionId,
          kind: SubscriptionTable.kind,
          periodStart: SubscriptionInvoiceTable.periodStart,
        })
        .from(SubscriptionInvoiceTable)
        .innerJoin(
          MemberSubscriptionTable,
          eq(SubscriptionInvoiceTable.memberSubscriptionId, MemberSubscriptionTable.id),
        )
        .leftJoin(SubscriptionTable, eq(MemberSubscriptionTable.subscriptionId, SubscriptionTable.id));
      const billed = new Set(
        existing.map((row) =>
          [
            row.subscriberType,
            row.subscriberId,
            row.kind === 'addon' ? `addon:${row.subscriptionId}` : 'plan',
            row.periodStart,
          ].join('|'),
        ),
      );

      const rows: SubscriptionInvoiceInsertType[] = [];
      for (const [key, winner] of winners) {
        if (billed.has(key)) continue;
        rows.push({
          memberSubscriptionId: winner.row.id,
          periodStart: winner.period.periodStart,
          periodEnd: winner.period.periodEnd,
          amount: winner.row.amount,
          currency: winner.row.currency,
          createdBy: actor,
          updatedBy: actor,
        });
      }

      if (rows.length === 0) return { scanned: subscriptions.length, created: 0, opened: [] };

      /**
       * Which organisation each lane belongs to, so the caller can announce what
       * it opened without a second pass over the ledger.
       *
       * Built from `subscriptions` — the rows this run already read — rather than
       * re-queried: the answer is in hand, and a second read could disagree with
       * the first if a plan moved between them.
       */
      const ownerOf = new Map(
        subscriptions.map((row) => [
          row.id,
          {
            subscriberType: row.subscriberType,
            subscriberId: row.subscriberId,
            subscriberName: row.subscriberName,
          },
        ]),
      );

      // Chunked, because a first run over a long history can be thousands of
      // rows and node-postgres binds one parameter per column.
      const CHUNK = 500;
      let created = 0;
      const opened: OpenedInvoice[] = [];
      for (let index = 0; index < rows.length; index += CHUNK) {
        const inserted = await db
          .insert(SubscriptionInvoiceTable)
          .values(rows.slice(index, index + CHUNK))
          .onConflictDoNothing({
            target: [
              SubscriptionInvoiceTable.memberSubscriptionId,
              SubscriptionInvoiceTable.periodStart,
            ],
          })
          /**
           * The RETURNING set is what makes the announcement honest. Read back
           * from the rows the database actually accepted, never from `rows`
           * above: `onConflictDoNothing` silently drops a period already billed,
           * and announcing the intended set would tell an org about a charge
           * that was not raised tonight.
           */
          .returning({
            id: SubscriptionInvoiceTable.id,
            memberSubscriptionId: SubscriptionInvoiceTable.memberSubscriptionId,
            periodStart: SubscriptionInvoiceTable.periodStart,
            periodEnd: SubscriptionInvoiceTable.periodEnd,
            amount: SubscriptionInvoiceTable.amount,
            currency: SubscriptionInvoiceTable.currency,
          });
        created += inserted.length;
        for (const row of inserted) {
          const owner = ownerOf.get(row.memberSubscriptionId);
          // A lane whose owner cannot be resolved is still BILLED — it is in the
          // table — it simply cannot be announced to anybody. Dropping it here
          // keeps the notification honest rather than addressing it to nobody.
          if (!owner) continue;
          opened.push({
            subscriberType: owner.subscriberType,
            subscriberId: owner.subscriberId,
            subscriberName: owner.subscriberName,
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            amount: row.amount,
            currency: row.currency,
          });
        }
      }

      return { scanned: subscriptions.length, created, opened };
    } catch (error) {
      logger.error('[SubscriptionInvoiceRepository.generateMissing] Error:', error);
      return { scanned: 0, created: 0, opened: [] };
    }
  }
}
