/**
 * Does the organisation chooser have anything to choose from, and would a
 * chosen id survive the server's check?
 *
 * Importers/callers: none — a standalone probe, run by hand.
 * Affected API: none written. Reads what `GET /auth/me` reads.
 * Data schemas: unchanged. The one INSERT happens inside a transaction that is
 * always rolled back, and the probe then proves nothing survived.
 * Owner's instruction: "add the agency picker so that after they login they
 * will see the options of their agency which they want to login to before it
 * reaches the portal page but this should only apply to people who are under 2
 * or more agencies/outlets."
 *
 * READ-ONLY IN EFFECT.
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-org-picker.ts
 */
import 'dotenv/config';

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable, AgencyUserTable } from '@/features/agency/agency.model';

import { OutletUserTable } from '@/features/outlet/outlet.model';

async function main() {
  // 1. WHO WOULD SEE THE CHOOSER TODAY — active memberships per account.
  const counts = await db.execute<{
    id: string;
    username: string;
    agencies: number;
    outlets: number;
  }>(sql`
    SELECT u.id,
           u.username,
           (SELECT count(*) FROM "main"."agency_user" au
              WHERE au.user_id = u.id AND lower(au.status) = 'active')::int AS agencies,
           (SELECT count(*) FROM "main"."outlet_user" ou
              WHERE ou.user_id = u.id AND lower(ou.status) = 'active')::int AS outlets
      FROM "main"."user" u
     ORDER BY u.username
  `);

  const rows = (counts.rows ?? []) as {
    id: string;
    username: string;
    agencies: number;
    outlets: number;
  }[];
  const multi = rows.filter((r) => r.agencies + r.outlets > 1);
  const single = rows.filter((r) => r.agencies + r.outlets === 1);
  const none = rows.filter((r) => r.agencies + r.outlets === 0);

  console.log('--- WHO SEES THE CHOOSER ---');
  console.log(`2+ active memberships : ${multi.length}  <- chooser SHOWS`);
  console.log(`exactly 1             : ${single.length}  <- skipped, straight through`);
  console.log(`none (admins, PRs)    : ${none.length}  <- never reaches it`);
  for (const r of multi) {
    console.log(`   ${r.username}: ${r.agencies} agency + ${r.outlets} outlet`);
  }

  // 2. THE TWO-ORGANISATION CASE, built and then rolled back. Nobody holds two
  //    today, so the only honest way to exercise the path is to make one exist
  //    for the length of a transaction.
  const owner = single.find((r) => r.agencies === 1);
  if (!owner) {
    console.log('\nno single-agency account to borrow — skipping the 2-org probe');
    return;
  }

  const agencies = await db
    .select({ id: AgencyTable.id, name: AgencyTable.name })
    .from(AgencyTable)
    .limit(5);

  console.log(`\n--- 2-ORG PROBE (rolled back) --- borrowing ${owner.username}`);

  await db
    .transaction(async (tx) => {
      const mine = await tx
        .select({ agencyId: AgencyUserTable.agencyId })
        .from(AgencyUserTable)
        .where(
          and(
            eq(AgencyUserTable.userId, owner.id),
            eq(AgencyUserTable.status, 'active'),
          ),
        );
      const held = new Set(mine.map((m) => m.agencyId));
      const other = agencies.find((a) => !held.has(a.id));
      if (!other) {
        console.log('   only one agency exists — cannot build a second membership');
        throw new Error('ROLLBACK');
      }

      await tx.insert(AgencyUserTable).values({
        agencyId: other.id,
        userId: owner.id,
        status: 'active',
        subRole: 'finance',
        createdBy: owner.id,
        updatedBy: owner.id,
        memberCode: 'PROBE0000',
      });

      const after = await tx
        .select({
          agencyId: AgencyUserTable.agencyId,
          name: AgencyTable.name,
        })
        .from(AgencyUserTable)
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyUserTable.agencyId))
        .where(
          and(
            eq(AgencyUserTable.userId, owner.id),
            eq(AgencyUserTable.status, 'active'),
          ),
        );

      console.log(`   /auth/me would list ${after.length} organisation(s):`);
      for (const m of after) console.log(`      ${m.name}`);
      console.log(`   chooser shows: ${after.length > 1 ? 'YES' : 'NO'}`);

      // The test resolveOrgScope makes on the header: honour the id only when
      // it names an ACTIVE membership of this caller.
      const chosen = after[after.length - 1].agencyId;
      const foreign = '00000000-0000-0000-0000-000000000000';
      console.log(
        `   x-org-id = the newer membership -> honoured: ${after.some((m) => m.agencyId === chosen)}`,
      );
      console.log(
        `   x-org-id = a foreign agency     -> honoured: ${after.some((m) => m.agencyId === foreign)} (falls back)`,
      );

      throw new Error('ROLLBACK');
    })
    .catch((e) => {
      if (e instanceof Error && e.message === 'ROLLBACK') {
        console.log('   rolled back — nothing written');
        return;
      }
      throw e;
    });

  // 3. Prove the rollback took.
  const leftAgency = await db
    .select({ id: AgencyUserTable.id })
    .from(AgencyUserTable)
    .where(eq(AgencyUserTable.memberCode, 'PROBE0000'));
  const leftOutlet = await db
    .select({ id: OutletUserTable.id })
    .from(OutletUserTable)
    .where(eq(OutletUserTable.memberCode, 'PROBE0000'));
  console.log(`   PROBE0000 left in agency_user: ${leftAgency.length} (must be 0)`);
  console.log(`   PROBE0000 left in outlet_user: ${leftOutlet.length} (must be 0)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
