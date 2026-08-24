/**
 * READ-ONLY. Does the Post Job "Select PRs" pool actually narrow to the
 * agencies the shift is being SENT to?
 *
 * Writes nothing: every call is a list read. Proves four claims the picker now
 * depends on —
 *   1. every card returned for one agency really belongs to that agency;
 *   2. narrowing to one agency is a strict subset of the venue's whole pool;
 *   3. the per-agency lists reassemble into the whole pool (nobody vanishes);
 *   4. asking for an agency the venue may NOT book returns nobody — the
 *      intersection refuses to widen, rather than falling back to everything.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-post-job-pr-pool-scope.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';
// The REAL narrowing rule, not a restatement of it — a probe that re-implements
// what it is testing will happily certify a broken original.
import { narrowToRequestedAgencies } from '../features/pr-personnel/pr.controller';
import { PrRepositoryClass } from '../features/pr-personnel/pr.repository';

const repo = new PrRepositoryClass();
let failures = 0;

function check(claim: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${claim}${detail ? ` — ${detail}` : ''}`);
}

async function poolFor(agencyIdsIn: string[]) {
  const { prs } = await repo.listPaginated({
    filter: { agencyIdsIn, excludePending: true },
    page: 1,
    pageSize: 500,
  });
  return prs;
}

async function main() {
  // An outlet with the most approved agencies — the only venue where narrowing
  // is observable at all. One agency and every list is trivially the same list.
  const res: any = await db.execute(sql`
    SELECT ao.outlet_id, o.name AS outlet_name,
           array_agg(ao.agency_id ORDER BY a.name) AS agency_ids,
           array_agg(a.name ORDER BY a.name) AS agency_names
    FROM main.agency_outlet ao
    JOIN main.agency a ON a.id = ao.agency_id
    JOIN main.outlet o ON o.id = ao.outlet_id
    WHERE ao.approve_status = 'approved'
    GROUP BY ao.outlet_id, o.name
    ORDER BY count(*) DESC
    LIMIT 1`);
  const row = (res.rows ?? res)[0];
  if (!row) {
    console.log('SKIP — no outlet has an approved agency link, so there is nothing to narrow.');
    console.log('A zero-row probe proves nothing; fix the fixture before trusting a pass.');
    process.exit(1);
  }

  const bookable: string[] = row.agency_ids;
  const names: string[] = row.agency_names;
  console.log(`\nOutlet: ${row.outlet_name} — ${bookable.length} approved agencies: ${names.join(', ')}`);

  const whole = await poolFor(bookable);
  console.log(`Whole pool (every approved agency): ${whole.length} PRs\n`);
  if (whole.length === 0) {
    console.log('SKIP — this venue can book nobody, so a narrowed list is empty either way.');
    process.exit(1);
  }

  const wholeIds = new Set(whole.map((p) => p.id));
  const seen = new Set<string>();

  for (let i = 0; i < bookable.length; i++) {
    const agencyId = bookable[i]!;
    const narrowed = await poolFor(narrowToRequestedAgencies(bookable, agencyId));
    console.log(`"Send to ${names[i]}" only → ${narrowed.length} PRs`);
    check(
      'every card returned belongs to that agency',
      narrowed.every((p) => p.agencyId === agencyId),
      narrowed.filter((p) => p.agencyId !== agencyId).map((p) => p.name).join(', ') || 'all match',
    );
    check(
      'the narrowed list is a subset of the whole pool',
      narrowed.every((p) => wholeIds.has(p.id)),
    );
    check(
      'it is strictly smaller than the whole pool, or the venue has one agency',
      narrowed.length < whole.length || bookable.length === 1,
      `${narrowed.length} of ${whole.length}`,
    );
    for (const p of narrowed) seen.add(p.id);
  }

  console.log('\nAll agencies re-assembled:');
  check(
    'nobody disappears — the per-agency lists cover the whole pool',
    [...wholeIds].every((id) => seen.has(id)),
    `${seen.size} of ${wholeIds.size} people seen`,
  );

  // An agency this venue has NO approved link with.
  const foreign: any = await db.execute(sql`
    SELECT id, name FROM main.agency
    WHERE id NOT IN (SELECT agency_id FROM main.agency_outlet WHERE outlet_id = ${row.outlet_id} AND approve_status = 'approved')
    LIMIT 1`);
  const other = (foreign.rows ?? foreign)[0];
  if (other) {
    console.log(`\nAsking for an agency this venue cannot book (${other.name}):`);
    const narrowed = narrowToRequestedAgencies(bookable, other.id);
    check('the intersection drops it rather than honouring it', narrowed.length === 0);
    const rows = await poolFor(narrowed);
    check('and the pool comes back EMPTY, not "everyone"', rows.length === 0, `${rows.length} PRs`);
  } else {
    console.log('\n(no unlinked agency exists to test the refusal against)');
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
