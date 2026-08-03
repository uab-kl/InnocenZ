/**
 * Clears the subscription churn one agency accumulated inside a time window, and
 * leaves it on one named tier.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/clear-agency-churn.ts
 *   (add --apply to write; without it the script only reports)
 *
 * Written for a specific defect, on 3 Aug 2026: the agency Subscription screen's
 * volume rule reset any agency on Custom whose weekly PV count sat inside the
 * rate card. Atlas issues 0–2 PVs, so every price the admin agreed was undone
 * within the same minute — `Custom RM 99.00` started 09:47 and expired 09:47 —
 * leaving ten ledger rows and five reset requests that record nothing anyone
 * decided. The rule is fixed; this removes the wreckage it left.
 *
 * Deliberately NOT general. It takes an explicit agency, an explicit window and
 * an explicit tier, because "delete this organisation's billing history" is not
 * something a script should be able to do by accident. Rows outside the window —
 * the agency's real history — are never touched.
 *
 * Every row it will delete is printed AND written to a rollback JSON before
 * anything is removed. Re-inserting that file restores the exact rows.
 */
import '@/env.js';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { AdminRequestTable } from '@/features/admin-request/admin-request.model.js';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { MemberSubscriptionTable } from '@/features/member-subscription/member-subscription.model.js';
import { SubscriptionTable } from '@/features/subscription/subscription.model.js';

const ACTOR = 'clear-agency-churn';
const APPLY = process.argv.includes('--apply');

/** The one agency, window and landing tier this run is allowed to touch. */
const AGENCY_NAME = 'Atlas Agency';
const FROM = new Date('2026-08-03T09:30:00.000Z');
const TO = new Date('2026-08-03T10:30:00.000Z');
const LAND_ON = 'Starter';

async function main() {
  const [agency] = await db
    .select({ id: AgencyTable.id, name: AgencyTable.name })
    .from(AgencyTable)
    .where(eq(AgencyTable.name, AGENCY_NAME))
    .limit(1);
  if (!agency) throw new Error(`No agency named ${AGENCY_NAME}`);

  const ledgerChurn = await db
    .select()
    .from(MemberSubscriptionTable)
    .where(
      and(
        eq(MemberSubscriptionTable.subscriberId, agency.id),
        gte(MemberSubscriptionTable.startedAt, FROM),
        lte(MemberSubscriptionTable.startedAt, TO),
      ),
    );

  const requestChurn = await db
    .select()
    .from(AdminRequestTable)
    .where(
      and(
        eq(AdminRequestTable.subscriberId, agency.id),
        gte(AdminRequestTable.createdAt, FROM),
        lte(AdminRequestTable.createdAt, TO),
      ),
    );

  console.log(`\n${agency.name} — ledger rows in window (${ledgerChurn.length}):`);
  for (const row of ledgerChurn) {
    console.log(
      `  delete  ${row.planName.padEnd(8)} RM ${String(row.amount).padStart(9)} · ${row.status.padEnd(8)} · ${row.startedAt.toISOString().slice(0, 19)}`,
    );
  }
  console.log(`\n${agency.name} — request rows in window (${requestChurn.length}):`);
  for (const row of requestChurn) {
    console.log(`  delete  ${row.type.padEnd(21)} · ${row.status.padEnd(9)} · ${(row.message ?? '').slice(0, 60)}`);
  }

  const [plan] = await db
    .select()
    .from(SubscriptionTable)
    .where(and(eq(SubscriptionTable.name, LAND_ON), eq(SubscriptionTable.subscriptionType, 'agency')))
    .limit(1);
  if (!plan) throw new Error(`No agency plan named ${LAND_ON}`);
  console.log(`\nland on  ${plan.name} (RM ${plan.price} / ${plan.billingCycle}) — one active row`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    process.exit(0);
  }

  // The rollback, written BEFORE the first delete. Nothing is removed until this
  // file exists on disk.
  const stamp = FROM.toISOString().slice(0, 10);
  const backup = join(tmpdir(), `agency-churn-${agency.name.replace(/\W+/g, '-')}-${stamp}.json`);
  writeFileSync(backup, JSON.stringify({ agency, ledgerChurn, requestChurn }, null, 2), 'utf8');
  console.log(`\nbackup written to ${backup}`);

  if (ledgerChurn.length) {
    await db.delete(MemberSubscriptionTable).where(
      inArray(
        MemberSubscriptionTable.id,
        ledgerChurn.map((row) => row.id),
      ),
    );
  }
  if (requestChurn.length) {
    await db.delete(AdminRequestTable).where(
      inArray(
        AdminRequestTable.id,
        requestChurn.map((row) => row.id),
      ),
    );
  }

  // Whatever survived is history; close any of it still marked active, so the
  // one row created below is unambiguously the current tier.
  await db
    .update(MemberSubscriptionTable)
    .set({ status: 'expired', endedAt: new Date(), updatedBy: ACTOR })
    .where(
      and(
        eq(MemberSubscriptionTable.subscriberId, agency.id),
        eq(MemberSubscriptionTable.status, 'active'),
      ),
    );

  await db.insert(MemberSubscriptionTable).values({
    subscriberType: 'agency',
    subscriberId: agency.id,
    subscriberName: agency.name,
    subscriptionId: plan.id,
    planName: plan.name,
    amount: plan.price,
    billingCycle: plan.billingCycle,
    status: 'active',
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });

  console.log(
    `\nAPPLIED: ${ledgerChurn.length} ledger rows deleted, ${requestChurn.length} request rows deleted, ` +
      `${agency.name} now on ${plan.name} RM ${plan.price}.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
