/**
 * Repairs the `member_subscription` ledger so admin History tells the truth
 * about who is subscribed.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/repair-member-subscription-links.ts
 *   (add --apply to write; without it the script only reports)
 *
 * Two defects in the seeded ledger, both found 3 Aug 2026 from the admin
 * History page:
 *
 * 1. **Broken links.** Every agency row and two outlet rows carry a
 *    `subscriber_id` that matches NO row in `agency`/`outlet` — the seed wrote
 *    random uuids and leaned on the snapshot name instead. So Atlas Agency was
 *    listed as subscribed AND as never charged at the same time: the ledger row
 *    said "Atlas Agency" while pointing at nothing. Where the snapshot name
 *    matches exactly one real organisation, this relinks the row to that
 *    organisation's primary id (Rule: reference other tables by their id).
 *
 * 2. **Missing rows.** Organisations that can sign in but have never been
 *    charged have no ledger row at all, so they cannot appear in History. The
 *    BACKFILL list below gives the named ones the plan their own portal shows.
 *    Nothing else is invented: an organisation not in that list is reported and
 *    left alone.
 *
 * Rows whose name matches no organisation (e.g. "Marble Hall") are REPORTED,
 * never deleted — deleting billing history is the owner's call, not a script's.
 *
 * Safe to re-run: relinking is skipped once a row already points at its
 * organisation, and a backfill is skipped once that organisation has an active
 * row.
 */
import '@/env.js';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '@/db/index.js';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AdminRequestTable } from '@/features/admin-request/admin-request.model.js';
import { MemberSubscriptionTable } from '@/features/member-subscription/member-subscription.model.js';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';
import { SubscriptionTable } from '@/features/subscription/subscription.model.js';

const ACTOR = 'repair-member-subscription-links';
const APPLY = process.argv.includes('--apply');
/**
 * Also DELETE the ledger rows that name an organisation which does not exist —
 * seeded demo billing for venues and agencies that were never real. Opt-in and
 * separate from --apply, because deleting billing history is a decision, not a
 * repair. Every deleted row is printed and written to a rollback file first.
 */
const PURGE_GHOSTS = process.argv.includes('--purge-ghosts');

/**
 * Organisations to give a first ledger row, and the plan to give them — taken
 * from what their own portal shows, not guessed by the script. Names must match
 * `outlet.name` / `agency.name`; plans must match `subscription.name`.
 */
const BACKFILL: { name: string; type: 'outlet' | 'agency'; plan: string }[] = [
  { name: 'JK House', type: 'outlet', plan: 'Enterprise' },
  { name: 'Emhub Testing', type: 'outlet', plan: 'Essential' },
];

async function main() {
  const ledger = await db.select().from(MemberSubscriptionTable);
  const outlets = await db.select({ id: OutletTable.id, name: OutletTable.name }).from(OutletTable);
  const agencies = await db.select({ id: AgencyTable.id, name: AgencyTable.name }).from(AgencyTable);
  const plans = await db.select().from(SubscriptionTable);

  const byName = (rows: { id: string; name: string }[], name: string) =>
    rows.filter((row) => row.name.trim().toLowerCase() === name.trim().toLowerCase());

  let relinked = 0;
  const orphans: string[] = [];
  const ghosts: typeof ledger = [];

  for (const row of ledger) {
    const pool = row.subscriberType === 'outlet' ? outlets : agencies;
    if (pool.some((org) => org.id === row.subscriberId)) continue; // already linked

    const matches = byName(pool, row.subscriberName);
    if (matches.length !== 1) {
      orphans.push(`${row.subscriberName} (${row.subscriberType}, ${matches.length} name matches)`);
      if (matches.length === 0) ghosts.push(row);
      continue;
    }
    console.log(`relink  ${row.subscriberName} -> ${matches[0].id}`);
    if (APPLY) {
      await db
        .update(MemberSubscriptionTable)
        .set({ subscriberId: matches[0].id, updatedAt: new Date(), updatedBy: ACTOR })
        .where(eq(MemberSubscriptionTable.id, row.id));
    }
    relinked += 1;
  }

  let added = 0;
  for (const wanted of BACKFILL) {
    const pool = wanted.type === 'outlet' ? outlets : agencies;
    const org = byName(pool, wanted.name)[0];
    if (!org) {
      console.log(`skip    ${wanted.name}: no such ${wanted.type}`);
      continue;
    }
    const [existing] = await db
      .select({ id: MemberSubscriptionTable.id })
      .from(MemberSubscriptionTable)
      .where(
        and(
          eq(MemberSubscriptionTable.subscriberId, org.id),
          eq(MemberSubscriptionTable.status, 'active'),
        ),
      )
      .limit(1);
    if (existing) {
      console.log(`skip    ${wanted.name}: already has an active subscription`);
      continue;
    }
    const plan = plans.find(
      (p) =>
        p.name.trim().toLowerCase() === wanted.plan.trim().toLowerCase() &&
        p.subscriptionType === wanted.type,
    );
    if (!plan) {
      console.log(`skip    ${wanted.name}: no ${wanted.type} plan named ${wanted.plan}`);
      continue;
    }
    console.log(`add     ${wanted.name} -> ${plan.name} (RM ${plan.price} / ${plan.billingCycle})`);
    if (APPLY) {
      await db.insert(MemberSubscriptionTable).values({
        subscriberType: wanted.type,
        subscriberId: org.id,
        subscriberName: org.name,
        subscriptionId: plan.id,
        planName: plan.name,
        amount: plan.price,
        billingCycle: plan.billingCycle,
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
    }
    added += 1;
  }

  let purged = 0;
  if (ghosts.length && PURGE_GHOSTS) {
    // The rollback: the complete rows, printed and saved, BEFORE the delete.
    // Re-inserting this file restores them exactly.
    const backup = join(tmpdir(), `member-subscription-ghosts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(backup, JSON.stringify(ghosts, null, 2), 'utf8');
    console.log(`\nbackup written to ${backup}`);
    for (const row of ghosts) {
      console.log(
        `delete  ${row.subscriberName} (${row.subscriberType}) ${row.planName} RM${row.amount} · ${row.status} · created_by=${row.createdBy}`,
      );
    }
    if (APPLY) {
      await db.delete(MemberSubscriptionTable).where(
        inArray(
          MemberSubscriptionTable.id,
          ghosts.map((row) => row.id),
        ),
      );
    }
    purged = ghosts.length;
  }

  /**
   * The same ghosts, one table over. `admin_request` rows naming an organisation
   * that does not exist put fictional subscribers in the admin's Plan Request and
   * Plan Change queues — Summit Staffing, Pioneer Crew and Horizon Talent are in
   * neither `agency` nor the ledger, yet all three sit in the inbox asking to
   * negotiate a price.
   *
   * Only the SUBSCRIBER types are judged. A `contact`/`other` request can
   * legitimately come from someone who is not an organisation yet, and deleting an
   * enquiry because the enquirer has no account is not this script's call.
   */
  const SUBSCRIBER_TYPES: readonly string[] = [
    'plan_change',
    'pos_integration_quote',
    'custom_renegotiation',
  ];
  const allRequests = await db.select().from(AdminRequestTable);
  const requestGhosts = allRequests.filter((row) => {
    if (!SUBSCRIBER_TYPES.includes(row.type) || !row.subscriberType) return false;
    const pool = row.subscriberType === 'outlet' ? outlets : agencies;
    if (row.subscriberId && pool.some((org) => org.id === row.subscriberId)) return false;
    return byName(pool, row.subscriberName).length === 0;
  });

  let purgedRequests = 0;
  if (requestGhosts.length) {
    console.log(`\nRequest rows naming an organisation that does not exist (${requestGhosts.length}):`);
    for (const row of requestGhosts) {
      console.log(
        `  ${row.subscriberName} (${row.subscriberType}) ${row.type} · ${row.status} · created_by=${row.createdBy}`,
      );
    }
    if (PURGE_GHOSTS) {
      const backup = join(
        tmpdir(),
        `admin-request-ghosts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      );
      writeFileSync(backup, JSON.stringify(requestGhosts, null, 2), 'utf8');
      console.log(`  backup written to ${backup}`);
      if (APPLY) {
        await db.delete(AdminRequestTable).where(
          inArray(
            AdminRequestTable.id,
            requestGhosts.map((row) => row.id),
          ),
        );
      }
      purgedRequests = requestGhosts.length;
    } else {
      console.log('  left untouched — pass --purge-ghosts (with --apply) to delete');
    }
  }

  // Requests raised before the controller started stamping it have no
  // `current_plan_id`, so the admin drawer's "BEFORE · FROM PLAN" is blank.
  // Fill it from the subscriber's active plan — for an unanswered request that
  // IS the plan it is on, which is what the admin needs to see.
  let stamped = 0;
  const openRequests = await db
    .select()
    .from(AdminRequestTable)
    .where(isNull(AdminRequestTable.currentPlanId));
  for (const request of openRequests) {
    if (!request.subscriberId || !request.subscriberType) continue;
    const [active] = await db
      .select({ subscriptionId: MemberSubscriptionTable.subscriptionId })
      .from(MemberSubscriptionTable)
      .where(
        and(
          eq(MemberSubscriptionTable.subscriberId, request.subscriberId),
          eq(MemberSubscriptionTable.status, 'active'),
        ),
      )
      .limit(1);
    if (!active?.subscriptionId) continue;
    console.log(`stamp   ${request.subscriberName} (${request.type}) from-plan <- current`);
    if (APPLY) {
      await db
        .update(AdminRequestTable)
        .set({ currentPlanId: active.subscriptionId, updatedAt: new Date(), updatedBy: ACTOR })
        .where(eq(AdminRequestTable.id, request.id));
    }
    stamped += 1;
  }

  console.log(
    `\n${APPLY ? 'APPLIED' : 'DRY RUN (pass --apply to write)'}: ${relinked} relinked, ${added} added, ` +
      `${purged} ledger rows deleted, ${purgedRequests} request rows deleted, ${stamped} from-plans stamped.`,
  );
  if (orphans.length && !PURGE_GHOSTS) {
    console.log(
      `\nLedger rows naming an organisation that does not exist — left untouched (pass --purge-ghosts to delete):\n  ${orphans.join('\n  ')}`,
    );
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
