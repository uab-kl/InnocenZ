import 'dotenv/config';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import { AgencyPrTable, PrTable, type PrTier } from '@/features/pr/pr.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { logger } from '@/util/logger';

// Fills the `pr` table (PR personnel roster) that the agency Manage-PR screen
// reads. This is a DIFFERENT table from the PR user accounts seeded by
// seed-sample-prs, which writes user / user_profile / user_role and the
// skeleton pr + agency_pr rows this script then fills in.
//
// Rows are derived from the existing agency_pr links rather than a
// hardcoded list, so this stays in sync with whatever PRs are attached to an
// agency: one `pr` row per (agency, PR user) pair. Additive and idempotent —
// an existing row for a pair is refreshed in place, never duplicated, and rows
// created by anyone else are left alone.
const ACTOR = 'seed-sample-pr-personnel';

// Cosmetic spread so the roster's tier column is not uniformly Tier I. Keyed by
// email to stay stable across re-runs.
const TIER_BY_EMAIL: Record<string, PrTier> = {
  'pr.vicky@innocenz.demo': 'tier_3',
  'pr.nurul@innocenz.demo': 'tier_2',
  'pr.sofia@innocenz.demo': 'tier_2',
};

function legalName(fullName: string | null, fallback: string): string {
  return fullName?.trim() || fallback;
}

export async function seedSamplePrPersonnel(): Promise<void> {
  const agencies = await db
    .select({ id: AgencyTable.id, name: AgencyTable.name, code: AgencyTable.agencyCode })
    .from(AgencyTable);

  if (agencies.length === 0) {
    logger.warn('[seed-sample-pr-personnel] No agencies found — run seed-sample-orgs first');
    return;
  }

  // Every PR-to-agency link, joined to the user + profile behind it.
  const links = await db
    .select({
      prId: PrTable.id,
      agencyId: AgencyPrTable.agencyId,
      userId: UserTable.id,
      username: UserTable.username,
      email: UserTable.email,
      phoneNum: UserTable.phoneNum,
      fullName: UserProfileTable.fullName,
      idNo: UserProfileTable.idNo,
    })
    .from(AgencyPrTable)
    .innerJoin(PrTable, eq(PrTable.id, AgencyPrTable.prId))
    .innerJoin(UserTable, eq(UserTable.id, PrTable.userId))
    .leftJoin(UserProfileTable, eq(UserProfileTable.userId, UserTable.id))
    .where(
      inArray(
        AgencyPrTable.agencyId,
        agencies.map((a) => a.id),
      ),
    );

  if (links.length === 0) {
    logger.warn(
      '[seed-sample-pr-personnel] No agency_pr links found — run seed-sample-prs first',
    );
    return;
  }

  const agencyNameById = new Map(agencies.map((a) => [a.id, a.name]));
  const perAgency = new Map<string, number>();
  let created = 0;
  let refreshed = 0;

  for (const link of links) {
    const values = {
      // The roster shows the legal name as the record name and the floor name
      // as the nickname — mirrors managedPrFromBackend on the web side.
      name: legalName(link.fullName, link.username),
      nickname: link.username,
      tier: TIER_BY_EMAIL[link.email ?? ''] ?? ('tier_1' as PrTier),
      status: 'active' as const,
      phone: link.phoneNum,
      email: link.email,
      icNo: link.idNo,
      updatedBy: ACTOR,
    };

    const [existing] = await db
      .select({ id: PrTable.id })
      .from(PrTable)
      .where(and(eq(PrTable.agencyId, link.agencyId), eq(PrTable.userId, link.userId)))
      .limit(1);

    if (existing) {
      await db
        .update(PrTable)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(PrTable.id, existing.id));
      refreshed += 1;
    } else {
      await db.insert(PrTable).values({
        ...values,
        agencyId: link.agencyId,
        userId: link.userId,
        createdBy: ACTOR,
      });
      created += 1;
    }

    perAgency.set(link.agencyId, (perAgency.get(link.agencyId) ?? 0) + 1);
  }

  logger.info(
    `[seed-sample-pr-personnel] Done. ${created} created, ${refreshed} refreshed, ${links.length} total.`,
  );
  for (const [agencyId, count] of perAgency) {
    logger.info(`  ${agencyNameById.get(agencyId) ?? agencyId}: ${count} PR(s)`);
  }
}

const isDirectRun = process.argv[1]?.includes('seed-sample-pr-personnel');
if (isDirectRun) {
  seedSamplePrPersonnel()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[seed-sample-pr-personnel] Error:', error);
      process.exit(1);
    });
}
