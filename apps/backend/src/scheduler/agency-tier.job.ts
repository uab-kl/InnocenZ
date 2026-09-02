import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { SYSTEM_ACTOR } from '@/util/actor.js';
import {
  adminRequestRepository,
  agencyMemberRepository,
  memberSubscriptionRepository,
  subscriptionInvoiceRepository,
  subscriptionRepository,
} from '@/composition-root.js';
import { notifyMany } from '@/features/notification/notify.js';
import { applyPlanChangeToLedger } from '@/features/admin-request/apply-plan-change.js';
import { agencyWeeklyPvCount } from '@/features/subscription/plan-limit.js';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { MemberSubscriptionTable } from '@/features/member-subscription/member-subscription.model.js';
import { SubscriptionTable } from '@/features/subscription/subscription.model.js';
import { previousCompleteWeek } from '@/features/payment-voucher/payment-voucher-week.js';
import type { JobDefinition } from './scheduler.js';

/**
 * The agency tier rule, RUN BY THE SERVER.
 *
 * An agency does not pick its tier — the PVs it issued in a payroll week choose
 * the band. That rule existed only as a `useEffect` on the agency's own
 * Subscription screen, so it fired when a human happened to open that page and
 * never otherwise: an agency whose staff never visited it stayed on whatever
 * tier it was last left on, however much work it put through. This is that rule
 * with nobody watching.
 *
 * Sunday 03:30 KL, after the 02:00 payout job has issued the week's vouchers and
 * the 03:00 invoice job has opened the periods — the count has to be final
 * before it can decide anything.
 *
 * It RE-PRICES; it never refuses. A payment voucher is a PR's wage record, so
 * capping issuance to a billing band would withhold the pay documentation of
 * people who had already worked. The band moves the price instead, which is what
 * the product has always claimed it does.
 */
const SCHEDULE = '30 3 * * 0';

/**
 * The band a PV count falls into: the cheapest agency plan whose limit covers
 * it, and the open-ended plan when nothing does.
 *
 * Reads `limit_amount` from the catalog rather than parsing `coverage`'s text,
 * so the rule and the rate card cannot say different things. A plan with a NULL
 * limit is the top band by definition (Custom's "151+ PV/week").
 */
export function bandFor(
  plans: { id: string; name: string; limitAmount: number | null }[],
  count: number,
): { id: string; name: string; limitAmount: number | null } | null {
  const bounded = plans
    .filter((p) => p.limitAmount !== null)
    .sort((a, b) => (a.limitAmount as number) - (b.limitAmount as number));
  const fits = bounded.find((p) => count <= (p.limitAmount as number));
  if (fits) return fits;
  return plans.find((p) => p.limitAmount === null) ?? null;
}

async function runAgencyTier(): Promise<void> {
  const { weekStart, weekEnd } = previousCompleteWeek();

  const plans = await db
    .select({
      id: SubscriptionTable.id,
      name: SubscriptionTable.name,
      limitAmount: SubscriptionTable.limitAmount,
    })
    .from(SubscriptionTable)
    .where(
      and(
        eq(SubscriptionTable.subscriptionType, 'agency'),
        eq(SubscriptionTable.kind, 'plan'),
        eq(SubscriptionTable.status, 'active'),
      ),
    )
    .orderBy(asc(SubscriptionTable.price));
  if (plans.length === 0) {
    logger.warn('[agency-tier] no agency plans in the catalog; nothing to band against');
    return;
  }

  // Only agencies that hold a live PLAN. One with no subscription is a billing
  // question, not a tier question, and inventing a plan for it here would bill
  // an org that never subscribed.
  const live = await db
    .select({
      id: MemberSubscriptionTable.id,
      subscriberId: MemberSubscriptionTable.subscriberId,
      subscriberName: MemberSubscriptionTable.subscriberName,
      planName: MemberSubscriptionTable.planName,
      subscriptionId: MemberSubscriptionTable.subscriptionId,
    })
    .from(MemberSubscriptionTable)
    .where(
      and(
        eq(MemberSubscriptionTable.subscriberType, 'agency'),
        isNull(MemberSubscriptionTable.endedAt),
      ),
    );

  /**
   * AN AGENCY MID-NEGOTIATION IS NOT RE-BANDED (owner's call, 27 Aug 2026).
   *
   * The agency's own Subscription screen has always frozen its tier while a
   * Custom price request is open — `waitingOn` short-circuits the auto-tier
   * effect before it can write. This job did not, so the two disagreed about
   * the same agency: one that spiked to 200 PV, had a Custom request filed, and
   * then issued 10 PV the following week would read "Scale" on its own page
   * while this job quietly moved it to Plus. The job is the one that bills, so
   * the screen was the honest half and this was the lie.
   *
   * Frozen on the LATEST PREVIOUS tier is the owner's ruling: the price the
   * admin is negotiating against must not move under them mid-conversation.
   *
   * `subscriberIdsAwaitingAnswer` returns null on a READ FAILURE, which is not
   * the same as "nobody is negotiating" — treating it as an empty set would
   * re-price exactly the agencies this guard exists to protect. A run skipped
   * with a loud line is recoverable next Sunday; a wrongly re-banded agency is
   * a wrong invoice.
   */
  const awaitingCustom = await adminRequestRepository.subscriberIdsAwaitingAnswer(
    'custom_renegotiation',
  );
  if (awaitingCustom === null) {
    logger.error(
      '[agency-tier] could not read which agencies are awaiting a Custom price; ' +
        'skipping the re-pricing run rather than risk re-banding one mid-negotiation',
    );
    return;
  }

  /**
   * Tell the agency what it used and what that costs (owner's ask, 27 Aug 2026).
   *
   * This rule used to run in total silence: an agency's first news of a move
   * from Plus to Growth was a bigger invoice, and one past the rate card never
   * learned that a Custom price had been requested on its behalf. The log line
   * beside each outcome talks to us; this talks to them.
   *
   * ONE per agency per run, addressed to owner + finance — the same shape and
   * the same reasoning as `pv_day_review_pending` in the payout job. Finance
   * pays the invoice and the owner owns the relationship; nobody else on the
   * roster needs a billing statement.
   *
   * NEVER THROWS INTO THE LOOP. A notification that cannot be written must not
   * cost the next agency its re-pricing — the money work is the job, this is the
   * telling. Same argument as the planless report at the foot of the file.
   */
  async function sendStatement(params: {
    subscriberId: string;
    subscriberName: string;
    issued: number;
    title: string;
    body: string;
    outcome: 'moved' | 'unchanged' | 'past_rate_card' | 'frozen' | 'custom';
    planName: string;
  }): Promise<void> {
    try {
      const members = await agencyMemberRepository.listByAgency(params.subscriberId);
      const recipients = members
        .filter((m) => m.status === 'active')
        .filter((m) => m.subRole === 'owner' || m.subRole === 'finance')
        .map((m) => m.userId);
      if (recipients.length === 0) {
        logger.warn(
          `[agency-tier] ${params.subscriberName}: no active owner/finance member to send the ` +
            'weekly subscription statement to',
        );
        return;
      }
      await notifyMany(recipients, {
        kind: 'subscription_tier_weekly',
        title: params.title,
        body: params.body,
        payload: {
          weekStart,
          weekEnd,
          pvCount: params.issued,
          planName: params.planName,
          outcome: params.outcome,
        },
        actor: SYSTEM_ACTOR,
      });
    } catch (error) {
      logger.error(`[agency-tier] statement failed for ${params.subscriberName}:`, error);
    }
  }

  const vouchers = (n: number) => `${n} PV`;
  const window = `${weekStart} to ${weekEnd}`;

  let moved = 0;
  let flagged = 0;
  let frozen = 0;
  for (const row of live) {
    const current = plans.find((p) => p.id === row.subscriptionId) ?? null;

    /*
     * The count is read for EVERY agency now, before any of the skips below.
     * It used to be taken only where it could change a tier, which was right
     * while this job only re-priced — but the statement quotes the number even
     * when nothing moves, and "you issued 180 PV and stay on Custom" is exactly
     * what an agency on a negotiated price has no other way to find out.
     */
    const issued = await agencyWeeklyPvCount({ agencyId: row.subscriberId, weekStart });
    if (issued < 0) {
      // No statement here on purpose: the whole message is a number, and one
      // built on a failed read would be a confident wrong figure about money.
      logger.warn(`[agency-tier] PV count failed for ${row.subscriberName}; left on ${row.planName}`);
      continue;
    }

    /*
     * ⚠️ CUSTOM IS NEVER MOVED AUTOMATICALLY. A Custom price is a negotiated
     * agreement between two people; volume is evidence about it, not authority
     * over it. The web rule carries the same exemption and the same warning — an
     * earlier auto-reset re-priced an agreed figure four times in two minutes.
     * Leaving Custom is the agency pressing Reset, or the admin ending it.
     */
    if (current && current.limitAmount === null) {
      await sendStatement({
        subscriberId: row.subscriberId,
        subscriberName: row.subscriberName,
        issued,
        outcome: 'custom',
        planName: row.planName,
        title: `${vouchers(issued)} last week · Custom`,
        body:
          `You issued ${vouchers(issued)} between ${window}. You are on a negotiated Custom ` +
          `price, which volume does not change — the rate card bands do not apply to it.`,
      });
      continue;
    }

    if (row.subscriberId && awaitingCustom.has(row.subscriberId)) {
      frozen += 1;
      logger.info(
        `[agency-tier] ${row.subscriberName} has a Custom price request awaiting an answer — ` +
          `left on ${row.planName}`,
      );
      await sendStatement({
        subscriberId: row.subscriberId,
        subscriberName: row.subscriberName,
        issued,
        outcome: 'frozen',
        planName: row.planName,
        title: `${vouchers(issued)} last week · Custom price still pending`,
        body:
          `You issued ${vouchers(issued)} between ${window}. Your tier is held at ` +
          `${row.planName} while your Custom price request is open, so the figure being ` +
          `negotiated does not move under it. It resumes following your weekly volume once ` +
          `InnocenZ admin answers.`,
      });
      continue;
    }

    const banded = bandFor(plans, issued);
    if (!banded) continue;

    // Past the top bounded band there is no list price to apply — that is the
    // negotiation the admin has to have. Flagged, not silently switched onto a
    // plan whose catalog price is a placeholder 0.
    if (banded.limitAmount === null) {
      flagged += 1;
      logger.info(
        `[agency-tier] ${row.subscriberName} issued ${issued} PV in ${weekStart}..${weekEnd} — past the rate card; needs a Custom price from admin`,
      );
      await sendStatement({
        subscriberId: row.subscriberId,
        subscriberName: row.subscriberName,
        issued,
        outcome: 'past_rate_card',
        planName: row.planName,
        title: `${vouchers(issued)} last week · past the rate card`,
        body:
          `You issued ${vouchers(issued)} between ${window} — beyond the highest published ` +
          `band, which has no list price. InnocenZ admin has been asked to agree a Custom ` +
          `price with you. You stay on ${row.planName} until they answer.`,
      });
      continue;
    }

    if (banded.id === row.subscriptionId) {
      // A week that changed nothing still gets a statement. This is the invoice
      // basis, and an agency checking "what am I paying" must not be answered
      // with silence on precisely the weeks its tier held steady.
      await sendStatement({
        subscriberId: row.subscriberId,
        subscriberName: row.subscriberName,
        issued,
        outcome: 'unchanged',
        planName: banded.name,
        title: `${vouchers(issued)} last week · staying on ${banded.name}`,
        body:
          `You issued ${vouchers(issued)} between ${window}. That is still within the ` +
          `${banded.name} band, so your weekly charge is unchanged.`,
      });
      continue;
    }

    // Filed as the same 'direct' admin_request an agency switch has always
    // produced, so the move appears on the admin's Plan Change page with its
    // reason instead of a plan silently changing overnight.
    const request = await adminRequestRepository.create({
      type: 'plan_change',
      subscriberType: 'agency',
      subscriberId: row.subscriberId,
      subscriberName: row.subscriberName,
      currentPlanId: row.subscriptionId ?? null,
      requestedPlanId: banded.id,
      status: 'direct',
      message: `${issued} PV issued in ${weekStart}..${weekEnd} — tier moved from ${row.planName} to ${banded.name} by the weekly volume rule.`,
      createdBy: SYSTEM_ACTOR,
      updatedBy: SYSTEM_ACTOR,
    });

    await applyPlanChangeToLedger({
      memberSubscriptionRepository,
      subscriptionRepository,
      // The week opens at 03:00 and this job moves the tier at 03:30: the
      // week's invoice already exists, unpaid, at the old tier. Pricing the
      // switch re-prices it to the tier the PVs actually put the agency on.
      subscriptionInvoiceRepository,
      record: {
        id: request?.id ?? 'agency-tier-job',
        subscriberType: 'agency',
        subscriberId: row.subscriberId,
        subscriberName: row.subscriberName,
        requestedPlanId: banded.id,
      },
      actor: SYSTEM_ACTOR,
    });
    moved += 1;
    logger.info(
      `[agency-tier] ${row.subscriberName}: ${issued} PV -> ${banded.name} (was ${row.planName})`,
    );
    // Sent AFTER the ledger write, so a statement can never announce a move
    // that did not land. applyPlanChangeToLedger swallows its own failures by
    // design, which is exactly why the order matters rather than the result.
    await sendStatement({
      subscriberId: row.subscriberId,
      subscriberName: row.subscriberName,
      issued,
      outcome: 'moved',
      planName: banded.name,
      title: `${vouchers(issued)} last week · now on ${banded.name}`,
      body:
        `You issued ${vouchers(issued)} between ${window}. That volume falls in the ` +
        `${banded.name} band, so your weekly charge follows ${banded.name} from this period ` +
        `on — you were on ${row.planName}. Nothing to do: your tier follows the vouchers you ` +
        `issue, there is no plan to pick.`,
    });
  }

  // Logged even at zero: a quiet week is this job's normal outcome, and a silent
  // job is indistinguishable from one that stopped running.
  logger.info(
    `[agency-tier] week ${weekStart}..${weekEnd}: ${live.length} agency subscription(s) checked, ` +
      `${moved} moved, ${flagged} past the rate card, ${frozen} awaiting a Custom price`,
  );

  /*
   * Reporting only, and after the money work — so it is wrapped. The scheduler
   * logs any throw as "agency-tier failed", which would make a re-pricing run
   * that actually SUCCEEDED read as a failed one. A count nobody can take is
   * not worth that.
   */
  try {
    await reportPlanlessAgencies({
      plannedIds: new Set(
        live
          .map((r) => r.subscriberId)
          .filter((id): id is string => Boolean(id)),
      ),
      weekStart,
      weekEnd,
    });
  } catch (error) {
    logger.error('[agency-tier] planless-agency report failed:', error);
  }
}

/**
 * The agencies this job can never move: those holding no subscription row at
 * all.
 *
 * The loop above works FROM `member_subscription`, so an agency with zero rows
 * is not merely skipped — it is invisible to the rule. It is invisible to the
 * agency's own Subscription screen too, whose auto-tier effect is guarded on
 * `currentPlanName` being set. And enrolment happens in exactly one place,
 * `enrollSignupPackage` at sign-up. So an agency created any OTHER way — a seed
 * script, an admin, a migration — has no path onto a plan through any screen,
 * and nothing anywhere says so out loud.
 *
 * This pass does not fix that, deliberately. Writing a plan here would bill an
 * org that never subscribed, which is the same reason the loop above leaves
 * them out. It makes them SAYABLE: an agency issuing vouchers with no plan is
 * working unbilled and is the case worth a human's attention; one at zero PV is
 * dormant, and is counted rather than named.
 *
 * The planned set is SUBTRACTED from the agency list rather than re-queried, so
 * "holds a plan" cannot come to mean two different things inside one file.
 *
 * Exported for the same reason as `bandFor`: so it can be fired on its own,
 * against the real database, without running the re-pricing loop that writes.
 */
export async function reportPlanlessAgencies(params: {
  plannedIds: Set<string>;
  weekStart: string;
  weekEnd: string;
}): Promise<void> {
  // A pending_review / inactive / suspended agency without a plan is expected
  // rather than a gap, so only live ones are asked about.
  const agencies = await db
    .select({ id: AgencyTable.id, name: AgencyTable.name })
    .from(AgencyTable)
    .where(eq(AgencyTable.status, 'active'));

  const planless = agencies.filter((a) => !params.plannedIds.has(a.id));

  const working: string[] = [];
  let dormant = 0;
  let unknown = 0;
  for (const agency of planless) {
    const issued = await agencyWeeklyPvCount({
      agencyId: agency.id,
      weekStart: params.weekStart,
    });
    // -1 is the helper's READ FAILURE, not a quiet week. Folding it into
    // `dormant` would turn a broken query into a reassuring number.
    if (issued < 0) {
      unknown += 1;
      continue;
    }
    if (issued === 0) {
      dormant += 1;
      continue;
    }
    working.push(`${agency.name} (${issued} PV)`);
  }

  if (working.length > 0) {
    logger.warn(
      `[agency-tier] ${working.length} active agency(ies) issued PVs in ` +
        `${params.weekStart}..${params.weekEnd} with NO subscription — working ` +
        `unbilled, and no screen can put them on a plan: ${working.join(', ')}`,
    );
  }
  // Logged at zero too, for the reason the run summary above gives: a check
  // that says nothing when it finds nothing cannot be told apart from one that
  // stopped running. The denominator is carried so the line proves what was
  // actually examined.
  logger.info(
    `[agency-tier] ${planless.length} of ${agencies.length} active agency(ies) hold ` +
      `no subscription` +
      (planless.length > 0
        ? ` (${working.length} issuing PVs, ${dormant} dormant, ${unknown} count unavailable)`
        : ''),
  );
}

export const AGENCY_TIER_JOB: JobDefinition = {
  name: 'agency-tier',
  schedule: SCHEDULE,
  run: runAgencyTier,
};
