import 'dotenv/config';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import { AgencyPrTable, type PrTier } from '@/features/pr-personnel/pr.model';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { logger } from '@/util/logger';

/**
 * Refreshes demo roster tier/name facts after seed-sample-prs.
 * `main.pr` is gone (0089) — tiers live on `agency_pr`, names on user_profile.
 */
const ACTOR = 'seed-sample-pr-personnel';

const TIER_BY_EMAIL: Record<string, PrTier> = {
  'aina@demo.innocenz.local': 'tier_1',
  'haziq@demo.innocenz.local': 'tier_2',
  'mei@demo.innocenz.local': 'tier_3',
  'arjun@demo.innocenz.local': 'tier_2',
  'alice@demo.innocenz.local': 'tier_3',
  'victoria@demo.innocenz.local': 'tier_4',
};

function legalName(fullName: string | null, username: string): string {
  return fullName?.trim() || username || 'PR';
}

export async function seedSamplePrPersonnel() {
  const agencies = await db.select({ id: AgencyTable.id, name: AgencyTable.name }).from(AgencyTable);
  if (agencies.length === 0) {
    logger.warn('[seed-sample-pr-personnel] No agencies found — run seed-sample-orgs first');
    return;
  }

  const links = await db
    .select({
      agencyId: AgencyPrTable.agencyId,
      userId: UserTable.id,
      username: UserTable.username,
      email: UserTable.email,
      fullName: UserProfileTable.fullName,
    })
    .from(AgencyPrTable)
    .innerJoin(UserTable, eq(UserTable.id, AgencyPrTable.userId))
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
  let refreshed = 0;

  for (const link of links) {
    const tier = TIER_BY_EMAIL[link.email ?? ''] ?? ('tier_1' as PrTier);
    await db
      .update(AgencyPrTable)
      .set({ tier, updatedBy: ACTOR, updatedAt: new Date() })
      .where(
        and(eq(AgencyPrTable.agencyId, link.agencyId), eq(AgencyPrTable.userId, link.userId)),
      );

    if (link.fullName == null || link.fullName.trim() === '') {
      await db
        .update(UserProfileTable)
        .set({
          fullName: legalName(link.fullName, link.username),
          updatedBy: ACTOR,
          updatedAt: new Date(),
        })
        .where(eq(UserProfileTable.userId, link.userId));
    }

    refreshed += 1;
    perAgency.set(link.agencyId, (perAgency.get(link.agencyId) ?? 0) + 1);
  }

  logger.info(
    `[seed-sample-pr-personnel] Done. ${refreshed} memberships refreshed (tiers on agency_pr).`,
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
