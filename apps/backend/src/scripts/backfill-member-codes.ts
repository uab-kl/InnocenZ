/**
 * Give every existing account the id migration 0154 made room for.
 *
 *   agency operator  INNATAGY0001   (numbered within each agency)
 *   venue operator   INNEMOLT0001   (numbered within each venue)
 *   PR               INNPR0001      (one global sequence)
 *   admin            INNADM0001     (one global sequence)
 *
 * IDEMPOTENT. A row that already holds an id is never rewritten — an id that
 * changes on a re-run is not an id. Re-running fills only what is still empty,
 * so it is safe after accounts are added by hand.
 *
 * ORDERING IS DETERMINISTIC AND IT MATTERS: owners first, then guarantors, then
 * everyone else, each by created_at then id. The owner asked for the owner and
 * guarantor to be numbered first, and a stable tiebreak means a second run over
 * the same data produces identical numbers.
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/backfill-member-codes.ts
 */
import { and, asc, eq, isNotNull, isNull, like, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable, AgencyUserTable } from '@/features/agency/agency.model';
import { OutletTable, OutletUserTable } from '@/features/outlet/outlet.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { UserTable } from '@/features/user/user.model';
import { reserveOrgPrefix } from '@/util/member-code';

/** owner, then guarantor, then the rest — the owner's stated order. */
const LANE_RANK: Record<string, number> = {
  owner: 0,
  guarantor: 1,
  finance: 2,
  operations_head: 3,
  director: 4,
};

const pad = (n: number) => String(n).padStart(4, '0');

async function backfillOrg(kind: 'agency' | 'outlet') {
  const segment = kind === 'agency' ? 'AGY' : 'OLT';

  const orgs =
    kind === 'agency'
      ? await db
          .select({
            id: AgencyTable.id,
            name: AgencyTable.name,
            prefix: AgencyTable.memberCodePrefix,
          })
          .from(AgencyTable)
          .orderBy(asc(AgencyTable.createdAt), asc(AgencyTable.id))
      : await db
          .select({
            id: OutletTable.id,
            name: OutletTable.name,
            prefix: OutletTable.memberCodePrefix,
          })
          .from(OutletTable)
          .orderBy(asc(OutletTable.createdAt), asc(OutletTable.id));

  for (const org of orgs) {
    let prefix = org.prefix;
    if (!prefix) {
      prefix = await reserveOrgPrefix(kind, org.name);
      if (!prefix) {
        console.log(`  ! ${org.name}: no letters in the name, skipped`);
        continue;
      }
      if (kind === 'agency') {
        await db
          .update(AgencyTable)
          .set({ memberCodePrefix: prefix })
          .where(eq(AgencyTable.id, org.id));
      } else {
        await db
          .update(OutletTable)
          .set({ memberCodePrefix: prefix })
          .where(eq(OutletTable.id, org.id));
      }
      console.log(`  ${org.name} -> ${prefix}`);
    }

    const head = `INN${prefix}${segment}`;

    // Where this organisation's numbering already reached, so a re-run
    // continues rather than colliding.
    const taken =
      kind === 'agency'
        ? await db
            .select({ code: AgencyUserTable.memberCode })
            .from(AgencyUserTable)
            .where(
              and(
                isNotNull(AgencyUserTable.memberCode),
                like(AgencyUserTable.memberCode, `${head}%`),
              ),
            )
        : await db
            .select({ code: OutletUserTable.memberCode })
            .from(OutletUserTable)
            .where(
              and(
                isNotNull(OutletUserTable.memberCode),
                like(OutletUserTable.memberCode, `${head}%`),
              ),
            );
    let next =
      taken.reduce((max, r) => {
        const m = r.code?.match(/(\d+)$/);
        return Math.max(max, m ? Number(m[1]) : 0);
      }, 0) + 1;

    const missing =
      kind === 'agency'
        ? await db
            .select({
              id: AgencyUserTable.id,
              userId: AgencyUserTable.userId,
              createdAt: AgencyUserTable.createdAt,
            })
            .from(AgencyUserTable)
            .where(
              and(
                eq(AgencyUserTable.agencyId, org.id),
                isNull(AgencyUserTable.memberCode),
              ),
            )
            .orderBy(asc(AgencyUserTable.createdAt), asc(AgencyUserTable.id))
        : await db
            .select({
              id: OutletUserTable.id,
              userId: OutletUserTable.userId,
              createdAt: OutletUserTable.createdAt,
            })
            .from(OutletUserTable)
            .where(
              and(
                eq(OutletUserTable.outletId, org.id),
                isNull(OutletUserTable.memberCode),
              ),
            )
            .orderBy(asc(OutletUserTable.createdAt), asc(OutletUserTable.id));
    if (missing.length === 0) continue;

    // The lane is derived from RBAC, so it is read per person to put owners and
    // guarantors at the front.
    const rank = new Map<string, number>();
    for (const m of missing) {
      const roles = await db
        .select({ roleName: RoleTable.roleName, portalCode: PortalTable.code })
        .from(UserRoleTable)
        .innerJoin(RoleTable, eq(RoleTable.id, UserRoleTable.roleId))
        .leftJoin(PortalTable, eq(PortalTable.id, RoleTable.portalId))
        .where(eq(UserRoleTable.userId, m.userId));
      const mine = roles.find((r) => r.portalCode === kind);
      const lane = (mine?.roleName ?? 'Owner')
        .toLowerCase()
        .replace(/\s+/g, '_');
      rank.set(m.id, LANE_RANK[lane] ?? 9);
    }
    missing.sort(
      (a, b) =>
        (rank.get(a.id) ?? 9) - (rank.get(b.id) ?? 9) ||
        Number(new Date(a.createdAt)) - Number(new Date(b.createdAt)) ||
        a.id.localeCompare(b.id),
    );

    for (const m of missing) {
      const code = `${head}${pad(next)}`;
      if (kind === 'agency') {
        await db
          .update(AgencyUserTable)
          .set({ memberCode: code })
          .where(eq(AgencyUserTable.id, m.id));
      } else {
        await db
          .update(OutletUserTable)
          .set({ memberCode: code })
          .where(eq(OutletUserTable.id, m.id));
      }
      next += 1;
      console.log(`    ${code}`);
    }
  }
}

/** PRs and admins: one global sequence each, keyed off their portal role. */
async function backfillPeople(family: 'PR' | 'ADM', roleMatch: string) {
  const head = `INN${family}`;
  const taken = await db
    .select({ code: UserTable.memberCode })
    .from(UserTable)
    .where(
      and(
        isNotNull(UserTable.memberCode),
        like(UserTable.memberCode, `${head}%`),
      ),
    );
  let next =
    taken.reduce((max, r) => {
      const m = r.code?.match(/(\d+)$/);
      return Math.max(max, m ? Number(m[1]) : 0);
    }, 0) + 1;

  const people = await db
    .selectDistinct({
      id: UserTable.id,
      username: UserTable.username,
      createdAt: UserTable.createdAt,
    })
    .from(UserTable)
    .innerJoin(UserRoleTable, eq(UserRoleTable.userId, UserTable.id))
    .innerJoin(RoleTable, eq(RoleTable.id, UserRoleTable.roleId))
    .where(
      and(
        isNull(UserTable.memberCode),
        sql`lower(${RoleTable.roleName}) = ${roleMatch}`,
      ),
    )
    .orderBy(asc(UserTable.createdAt), asc(UserTable.id));

  for (const p of people) {
    const code = `${head}${pad(next)}`;
    await db
      .update(UserTable)
      .set({ memberCode: code })
      .where(eq(UserTable.id, p.id));
    next += 1;
    console.log(`  ${code}  ${p.username}`);
  }
  if (people.length === 0) console.log('  (none missing)');
}

console.log('AGENCIES');
await backfillOrg('agency');
console.log('VENUES');
await backfillOrg('outlet');
console.log('PRs');
await backfillPeople('PR', 'pr');
console.log('ADMINS');
await backfillPeople('ADM', 'admin');
console.log('done');
process.exit(0);
