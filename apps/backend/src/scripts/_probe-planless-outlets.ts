/**
 * Which live orgs hold no subscription plan — venues and agencies.
 *
 * READ-ONLY. Both halves go through `resolveActivePlanLimit`, the SAME function
 * the posting gate asks, rather than re-deriving "holds a plan" in SQL here. A
 * probe carrying its own copy of that predicate could report a clean estate
 * while the gate blocked half of it.
 *
 * The two halves matter for different reasons:
 *   • an OUTLET with no plan is refused by `ShiftController` (2 Sep 2026), so it
 *     cannot post at all — an outage;
 *   • an AGENCY with no plan is not blocked from anything, but it is invisible
 *     to the Sunday tier rule, which reads FROM `member_subscription`, so it can
 *     never be re-priced and works unbilled indefinitely.
 *
 * The agency half deliberately does NOT reproduce the production report's
 * working/dormant split. `reportPlanlessAgencies` names only agencies that
 * issued PVs in one particular week, which is the right filter for a weekly
 * nag; this probe wants the whole estate in one look.
 *
 * Run:  tsx --tsconfig tsconfig.json src/scripts/_probe-planless-outlets.ts
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { resolveActivePlanLimit } from '@/features/subscription/plan-limit.js';
import { reportPlanlessOutlets } from '@/scheduler/agency-tier.job.js';

/**
 * Active agencies holding no plan.
 *
 * Only `status: 'active'` ones are asked about, matching the outlet report: a
 * pending_review or suspended org without a plan is expected rather than a gap.
 */
async function reportPlanlessAgenciesNow(): Promise<void> {
  const agencies = await db
    .select({ id: AgencyTable.id, name: AgencyTable.name })
    .from(AgencyTable)
    .where(eq(AgencyTable.status, 'active'));

  const planless: string[] = [];
  let unknown = 0;
  for (const agency of agencies) {
    const plan = await resolveActivePlanLimit({
      subscriberType: 'agency',
      subscriberId: agency.id,
    });
    // `unknown` is the lookup FAILING, not an absent plan. Folding it in would
    // turn a broken query into a list of orgs to go and fix.
    if (plan.kind === 'unknown') unknown += 1;
    else if (plan.kind === 'none') planless.push(agency.name);
  }

  if (planless.length > 0) {
    logger.warn(
      `[probe] ${planless.length} active agency(ies) hold NO subscription — working ` +
        `unbilled, and invisible to the Sunday tier rule: ${planless.join(', ')}`,
    );
  }
  logger.info(
    `[probe] ${planless.length} of ${agencies.length} active agency(ies) hold no subscription` +
      (unknown > 0 ? ` (${unknown} lookup(s) unavailable)` : ''),
  );
}

async function main() {
  await reportPlanlessOutlets();
  await reportPlanlessAgenciesNow();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[probe-planless-outlets] failed:', error);
    process.exit(1);
  });
