/**
 * READ-ONLY. Answers ONE question before `requireOutletScopeByParam` ships on
 * `GET|PUT /outlet-workspace/:outletId`:
 *
 *   "Is every outlet that has a saved workspace reachable by the agency that
 *    actually uses it, through an APPROVED `agency_outlet` link?"
 *
 * The new guard scopes an agency caller with
 * `listApprovedOutletIdsForAgency` — the repository's stated portal visibility
 * rule. If the agency portal has really been reaching these rows through
 * `outlet.onboarded_by_agency_id` (provenance only since 0123) and the matching
 * `agency_outlet` row is missing or not 'approved', the guard would 403 a
 * screen that works today. That is the one way this fix could regress, so it is
 * measured rather than assumed.
 *
 * Nothing is written.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-workspace-scope-coverage.ts
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';

async function main() {
  // Every outlet holding a workspace, with its provenance agency and the
  // approved-link set the new guard will actually consult.
  const rows = await db.execute(sql`
    select
      o.id                        as outlet_id,
      o.name                      as outlet_name,
      o.onboarded_by_agency_id    as onboarded_by,
      prov.name                   as onboarded_by_name,
      (
        select count(*) from main.agency_outlet ao
        where ao.outlet_id = o.id and ao.approve_status = 'approved'
      )                           as approved_links,
      (
        select count(*) from main.agency_outlet ao
        where ao.outlet_id = o.id
      )                           as total_links,
      (
        select bool_or(ao.approve_status = 'approved')
        from main.agency_outlet ao
        where ao.outlet_id = o.id and ao.agency_id = o.onboarded_by_agency_id
      )                           as onboarder_is_approved
    from main.outlet_workspace w
    join main.outlet o on o.id = w.outlet_id
    left join main.agency prov on prov.id = o.onboarded_by_agency_id
    order by o.name
  `);

  console.log('OUTLETS WITH A SAVED WORKSPACE:');
  console.log(
    '(approved_links=0 is the regression case for agency access)',
  );
  for (const r of rows.rows) console.log(' ', JSON.stringify(r));

  const orphans = rows.rows.filter((r) => Number(r.approved_links ?? 0) === 0);
  const provenanceOnly = rows.rows.filter(
    (r) => r.onboarded_by != null && r.onboarder_is_approved !== true,
  );

  console.log('\nSUMMARY');
  console.log(`  workspaces total .................. ${rows.rows.length}`);
  console.log(`  with ZERO approved agency links ... ${orphans.length}`);
  console.log(`  onboarder NOT approved-linked ..... ${provenanceOnly.length}`);

  if (orphans.length > 0) {
    console.log(
      '\n⚠️  Those outlets have no approved link. Under the new guard NO agency can',
    );
    console.log(
      '   read or write their rate card — only the venue itself and admin. Confirm',
    );
    console.log('   that is correct before shipping.');
  }
  if (provenanceOnly.length > 0) {
    console.log(
      '\n⚠️  Their onboarding agency has no APPROVED link, so an agency portal that',
    );
    console.log('   resolves via `onboarded_by_agency_id` would start 403ing.');
  }
  if (orphans.length === 0 && provenanceOnly.length === 0) {
    console.log('\n✅ Every workspace is covered by an approved link. Guard is safe.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
