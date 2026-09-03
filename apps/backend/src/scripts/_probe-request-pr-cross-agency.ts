/**
 * READ-ONLY. "The outlet requested Vicky from TWO agencies and only one of
 * them can see the ask."
 *
 * Four questions, in the order that turns a story into a diagnosis:
 *   1. Does the person actually hold more than one membership?
 *   2. On shifts that named her, how many agencies were INVITED vs how many
 *      REQUEST rows exist? An invite count > request count is the bug.
 *   3. Which membership won?
 *   4. Does the FIX resolve the pairs the owner asked for? `listMembershipPairs`
 *      is the exact resolution the create path now performs, so firing it at the
 *      live roster proves the fan-out without posting a shift.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-request-pr-cross-agency.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import { listMembershipPairs } from '../features/pr-personnel/pr.repository';

async function main() {
  // 1. Multi-roster people — the population this bug can even reach.
  const multi = await db.execute(sql`
    select u.username,
           count(*)::int as memberships,
           string_agg(a.name || ' (' || to_char(ap.created_at, 'YYYY-MM-DD') || ')',
                      ', ' order by ap.created_at) as agencies
    from main.agency_pr ap
    join main."user" u on u.id = ap.user_id
    join main.agency a on a.id = ap.agency_id
    group by u.username
    having count(*) > 1
    order by count(*) desc, u.username
  `);
  console.log('--- 1. PRs holding more than one membership ---');
  console.table(multi.rows);

  // 2. Every shift carrying a named request: agencies invited vs asked.
  const shifts = await db.execute(sql`
    select s.shift_date,
           o.name as outlet,
           (select count(*)::int from main.shift_agency sa where sa.shift_id = s.id) as invited,
           (select count(distinct r.agency_id)::int
              from main.shift_pr_request r where r.shift_id = s.id) as asked_agencies,
           (select count(*)::int
              from main.shift_pr_request r where r.shift_id = s.id) as request_rows,
           (select string_agg(distinct u.username, ', ')
              from main.shift_pr_request r
              join main."user" u on u.id = r.user_id
             where r.shift_id = s.id) as named
    from main.shift s
    join main.outlet o on o.id = s.outlet_id
    where exists (select 1 from main.shift_pr_request r where r.shift_id = s.id)
    order by s.created_at desc
    limit 25
  `);
  console.log('\n--- 2. Shifts with named requests (newest 25) ---');
  console.table(shifts.rows);

  // 3. For each request naming a multi-roster PR: which agency was addressed,
  //    and which invited agency held her but was never asked.
  const which = await db.execute(sql`
    select u.username,
           s.shift_date,
           asked.name as requested_from,
           (select string_agg(a3.name, ', ')
              from main.shift_agency sa
              join main.agency a3 on a3.id = sa.agency_id
             where sa.shift_id = r.shift_id
               and sa.agency_id <> r.agency_id
               and exists (select 1 from main.agency_pr ap3
                            where ap3.user_id = r.user_id
                              and ap3.agency_id = sa.agency_id))
             as invited_and_on_roster_but_not_asked
    from main.shift_pr_request r
    join main."user" u on u.id = r.user_id
    join main.agency asked on asked.id = r.agency_id
    join main.shift s on s.id = r.shift_id
    where (select count(*) from main.agency_pr ap where ap.user_id = r.user_id) > 1
    order by s.created_at desc
    limit 10
  `);
  console.log('\n--- 3. Multi-roster requests: asked vs silently skipped ---');
  console.table(which.rows);

  // 4. The fix, fired at the real roster. No writes.
  const ids = await db.execute(sql`
    select (select id from main."user" where username = 'Vicky')        as vicky,
           (select id from main.agency where name = 'Atlas Agency')     as atlas,
           (select id from main.agency where name = 'Why We Met Agency') as wwm,
           (select id from main.agency where name = 'Delta Agency')     as delta
  `);
  const { vicky, atlas, wwm, delta } = ids.rows[0] as unknown as Record<string, string>;
  const nameOf = new Map([
    [atlas, 'Atlas'],
    [wwm, 'Why We Met'],
    [delta, 'Delta'],
  ]);
  const show = (rows: { agencyId: string }[]) =>
    rows
      .map((r) => nameOf.get(r.agencyId) ?? r.agencyId)
      .sort()
      .join(', ') || '(none)';

  const both = show(await listMembershipPairs([vicky], [atlas, wwm]));
  const onlyWwm = show(await listMembershipPairs([vicky], [wwm]));
  const onlyAtlas = show(await listMembershipPairs([vicky], [atlas]));
  // FALSIFICATION: Delta is absent above because it was not INVITED, not for
  // some incidental reason (a rejected membership, a name typo). Invite it and
  // it must appear — a filter that can never say yes proves nothing.
  const deltaInvited = show(await listMembershipPairs([vicky], [atlas, wwm, delta]));

  console.log('\n--- 4. New resolver, fired at the live roster (no writes) ---');
  console.table([
    { posted_to: 'Atlas + Why We Met', asked: both, expected: 'Atlas, Why We Met' },
    { posted_to: 'Why We Met only', asked: onlyWwm, expected: 'Why We Met' },
    { posted_to: 'Atlas only', asked: onlyAtlas, expected: 'Atlas' },
    {
      posted_to: 'CONTROL: Delta posted to as well',
      asked: deltaInvited,
      expected: 'Atlas, Delta, Why We Met',
    },
    {
      posted_to: 'Delta on roster, NOT posted to',
      asked: both.includes('Delta') ? 'LEAKED' : 'Delta absent',
      expected: 'Delta absent',
    },
  ]);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
