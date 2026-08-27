import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { SYSTEM_ACTOR } from '@/util/actor.js';
import {
  adminRequestRepository,
  memberSubscriptionRepository,
  subscriptionRepository,
} from '@/composition-root.js';
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

  let moved = 0;
  let flagged = 0;
  let frozen = 0;
  for (const row of live) {
    const current = plans.find((p) => p.id === row.subscriptionId) ?? null;

    // Checked BEFORE the PV count, because the count cannot change the answer
    // for these and reading it would only cost a query per frozen agency.
    if (row.subscriberId && awaitingCustom.has(row.subscriberId)) {
      frozen += 1;
      logger.info(
        `[agency-tier] ${row.subscriberName} has a Custom price request awaiting an answer — ` +
          `left on ${row.planName}`,
      );
      continue;
    }

    /*
     * ⚠️ CUSTOM IS NEVER MOVED AUTOMATICALLY. A Custom price is a negotiated
     * agreement between two people; volume is evidence about it, not authority
     * over it. The web rule carries the same exemption and the same warning — an
     * earlier auto-reset re-priced an agreed figure four times in two minutes.
     * Leaving Custom is the agency pressing Reset, or the admin ending it.
     */
    if (current && current.limitAmount === null) continue;

    const issued = await agencyWeeklyPvCount({ agencyId: row.subscriberId, weekStart });
    if (issued < 0) {
      logger.warn(`[agency-tier] PV count failed for ${row.subscriberName}; left on ${row.planName}`);
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
      continue;
    }

    if (banded.id === row.subscriptionId) continue;

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
