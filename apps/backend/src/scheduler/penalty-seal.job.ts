import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { SYSTEM_ACTOR } from '@/util/actor.js';
import { agencyPenaltyRuleController } from '@/composition-root.js';
import { AgencyPenaltyRuleTable } from '@/features/agency/agency-penalty-rule.model.js';
import { previousCompleteWeek } from '@/features/payment-voucher/payment-voucher-week.js';
import type { JobDefinition } from './scheduler.js';

/**
 * A BREACH BECOMES A RECORDED CHARGE ON ITS OWN, ONCE THE WEEK IS OVER.
 *
 * Nothing in the product ever recorded one. The "Record penalties" button went
 * on 24 Aug 2026 and it was the ONLY caller of POST /:id/penalties/seal, so
 * every breach sat under "Not yet recorded" indefinitely — a label that was
 * accurate and could never stop being true. The owner found it on 7 Sep 2026
 * looking at a week that had closed days earlier: "why is the 'Not Yet
 * Recorded' still showing up as the week has already ended".
 *
 * ⚠️ SEALING IS NOT BILLING. This writes a `penalty_charge` row — the debt
 * becomes real and trackable — and nothing more. "Add to voucher" is still the
 * separate, human press that takes money out of a PR's pay. The automation
 * stops exactly where the money starts.
 *
 * ⚠️ AND IT IS REVERSIBLE. The owner's condition for accepting automation was
 * that the agency can undo one: "once it is recorded then the Agency can decide
 * whether they want to delete/void it". That is migration 0151 and
 * POST /:id/penalties/:chargeId/void. This job must never run without it — a
 * charge nobody chose, that nobody can remove, is worse than no charge at all.
 */

/**
 * SUNDAY 08:00 KL, and the hour is load-bearing.
 *
 * The payroll week is Sun–Sat, so it closes at Saturday midnight — but a
 * Saturday 22:00–04:00 shift is still being WORKED then, and its check-out
 * lands around 04:00 Sunday. `shiftsThisWeek` counts only `completed`, so
 * sealing at 02:00 alongside the other weekly jobs would judge a PR who worked
 * three shifts as having worked two, and fine them for a minimum they actually
 * met. 08:00 is after the overnight check-outs, and after the no-show sweep's
 * end-plus-3h grace has resolved Saturday night's absences.
 *
 * Deliberately AFTER the 02:00 payout and 03:00 invoice jobs for that reason,
 * and it costs them nothing: a charge is not a voucher line until somebody adds
 * it, so nothing downstream is waiting on this.
 */
const SCHEDULE = '0 8 * * 0';

export interface PenaltySealResult {
  agencies: number;
  sealed: number;
  evaluated: number;
  weekStart: string;
  weekEnd: string;
}

/**
 * `dryRun` evaluates without writing — the same courtesy the no-show sweep has,
 * for a sharper reason: this one creates money owed by a person.
 */
export async function runPenaltySeal(
  _now: Date = new Date(),
  options: { dryRun?: boolean } = {},
): Promise<PenaltySealResult> {
  const { weekStart, weekEnd } = previousCompleteWeek();

  // Only agencies that have actually configured a rule. One with none evaluates
  // to nothing anyway, and asking the question of every agency on the platform
  // to learn that is a query per agency for no answer.
  const agencyRows = await db
    .selectDistinct({ agencyId: AgencyPenaltyRuleTable.agencyId })
    .from(AgencyPenaltyRuleTable)
    .where(eq(AgencyPenaltyRuleTable.enabled, true));

  let sealed = 0;
  let evaluated = 0;
  for (const { agencyId } of agencyRows) {
    try {
      const result = await agencyPenaltyRuleController.sealClosedWeek(
        agencyId,
        weekStart,
        weekEnd,
        SYSTEM_ACTOR,
        options,
      );
      sealed += result.sealed;
      evaluated += result.evaluated;
    } catch (error) {
      // One agency's bad data must not cost the others their week. The
      // scheduler would swallow a throw from here anyway — but it would swallow
      // the whole RUN, not this one agency.
      logger.error(`[penalty-seal] agency ${agencyId} failed:`, error);
    }
  }

  logger.info(
    `[penalty-seal] ${weekStart}..${weekEnd} · ${agencyRows.length} agency(ies) · ` +
      `${evaluated} breach(es) evaluated · ${sealed} newly recorded` +
      (options.dryRun ? ' (DRY RUN — nothing written)' : ''),
  );
  return { agencies: agencyRows.length, sealed, evaluated, weekStart, weekEnd };
}

export const PENALTY_SEAL_JOB: JobDefinition = {
  name: 'penalty-seal',
  schedule: SCHEDULE,
  run: async () => {
    await runPenaltySeal();
  },
};
