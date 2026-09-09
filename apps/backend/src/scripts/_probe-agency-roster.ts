/**
 * Who is on each agency's roster right now — the numbers the agency Manage PR
 * page counts from.
 *
 * READ-ONLY. Membership lives on `agency_pr` (agency_id + user_id), which is the
 * only source of truth for it; nothing here reads a name off a roster table.
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-agency-roster.ts
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { AgencyTable } from '@/features/agency/agency.model';
import { AgencyPrTable } from '@/features/pr-personnel/pr.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';

async function main() {
  const agencies = await db
    .select({ id: AgencyTable.id, name: AgencyTable.name, code: AgencyTable.agencyCode })
    .from(AgencyTable);

  const links = await db
    .select({
      agencyId: AgencyPrTable.agencyId,
      userId: AgencyPrTable.userId,
      status: AgencyPrTable.approveStatus,
      tier: AgencyPrTable.tier,
      username: UserTable.username,
      email: UserTable.email,
    })
    .from(AgencyPrTable)
    .innerJoin(UserTable, eq(UserTable.id, AgencyPrTable.userId));

  /**
   * Every account that actually holds the PR role. Counting membership rows
   * alone can mislead: a link for somebody without the role would never appear
   * on the page, so the roster number and the row count are not the same fact.
   */
  const prRole = await db
    .select({ userId: UserRoleTable.userId })
    .from(UserRoleTable)
    .innerJoin(RoleTable, eq(RoleTable.id, UserRoleTable.roleId))
    .where(eq(RoleTable.roleName, 'pr'));
  const isPr = new Set(prRole.map((r) => r.userId));

  const nameById = new Map(agencies.map((a) => [a.id, `${a.name} (${a.code})`]));
  const byAgency = new Map<string, typeof links>();
  const agenciesOf = new Map<string, string[]>();

  for (const l of links) {
    const list = byAgency.get(l.agencyId) ?? [];
    list.push(l);
    byAgency.set(l.agencyId, list);

    const owned = agenciesOf.get(l.userId) ?? [];
    owned.push(nameById.get(l.agencyId) ?? l.agencyId);
    agenciesOf.set(l.userId, owned);
  }

  console.log(`\nagencies: ${agencies.length}   membership rows: ${links.length}`);
  console.log(`accounts holding the PR role: ${isPr.size}\n`);

  console.log('--- roster size per agency ---');
  for (const a of agencies) {
    const rows = byAgency.get(a.id) ?? [];
    const approved = rows.filter((r) => r.status === 'approved').length;
    const withRole = rows.filter((r) => isPr.has(r.userId)).length;
    console.log(
      `  ${(nameById.get(a.id) ?? '').padEnd(30)} ${String(rows.length).padStart(3)} linked` +
        `  ${String(approved).padStart(3)} approved  ${String(withRole).padStart(3)} hold PR role`,
    );
  }

  const shared = [...agenciesOf.entries()].filter(([, list]) => list.length > 1);
  const nameOf = new Map(links.map((l) => [l.userId, l.username ?? '(no username)']));
  console.log(`\n--- PRs on MORE THAN ONE roster: ${shared.length} ---`);
  for (const [userId, list] of shared) {
    console.log(`  ${(nameOf.get(userId) ?? '').padEnd(16)} ${list.join(' + ')}`);
  }

  const unlinked = [...isPr].filter((id) => !agenciesOf.has(id));
  console.log(`\n--- hold the PR role but sit on NO roster: ${unlinked.length} ---`);
  if (unlinked.length) {
    const all = await db.select({ id: UserTable.id, username: UserTable.username }).from(UserTable);
    const label = new Map(all.map((u) => [u.id, u.username ?? '(no username)']));
    for (const id of unlinked) console.log(`  ${label.get(id)}`);
  }

  console.log('');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
