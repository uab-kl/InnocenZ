/**
 * READ-ONLY. Follow-up to the outlet privacy sweep: the two endpoints that
 * handed a venue personal data — HOW MUCH, and about WHOM?
 *
 * `/user` and `/pr` both answered an outlet token with contact details. Whether
 * that is a leak turns entirely on scope: a venue seeing its OWN staff is
 * normal, a venue seeing every PR on the platform (or another agency's roster)
 * is not. This prints the row COUNT, the FIELD NAMES, and the size of the set
 * the outlet could actually justify — never the values.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-outlet-pii-scope.ts [email] [password] [outletName]
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';

const BASE = process.env.PROBE_API ?? 'http://localhost:7777/api/v1';
const EMAIL = process.argv[2] ?? 'emhub@emhub.test';
const PASSWORD = process.argv[3] ?? 'Password123!';
const OUTLET = process.argv[4] ?? 'Emhub Testing';

async function main() {
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = (await loginRes.json()) as { data?: { accessToken?: string } };
  const token = login.data?.accessToken;
  if (!token) throw new Error(`login failed: HTTP ${loginRes.status}`);

  const get = async (p: string) => {
    const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } });
    return (await r.json()) as { data?: unknown };
  };

  // Who has ever actually worked at this venue? That is the set a venue can
  // justify holding contact details for; anything beyond it is over-disclosure.
  const worked = await db.execute(sql`
    select count(distinct coalesce(sa.user_id, sa.pr_id))::int as n
      from main.shift_assignment sa
      join main.shift s on s.id = sa.shift_id
      join main.outlet o on o.id = s.outlet_id
     where o.name = ${OUTLET}
  `);
  const rosteredHere = (worked.rows[0] as unknown as { n: number }).n;

  const totals = await db.execute(sql`
    select
      (select count(*)::int from main."user") as users,
      (select count(distinct user_id)::int from main.agency_pr) as prs_platform_wide
  `);
  const t = totals.rows[0] as unknown as { users: number; prs_platform_wide: number };

  console.log(`\nOutlet: ${OUTLET}`);
  console.log(`  PRs who ever worked here : ${rosteredHere}`);
  console.log(`  users on the platform    : ${t.users}`);
  console.log(`  PRs on the platform      : ${t.prs_platform_wide}`);

  for (const path of ['/user', '/pr']) {
    const rows = ((await get(path)).data ?? []) as Record<string, unknown>[];
    const list = Array.isArray(rows) ? rows : [];
    const fields = new Set<string>();
    for (const r of list.slice(0, 25)) {
      for (const [k, v] of Object.entries(r)) {
        if (v !== null && v !== undefined && v !== '') fields.add(k);
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
            if (v2 !== null && v2 !== undefined && v2 !== '') fields.add(`${k}.${k2}`);
          }
        }
      }
    }
    console.log(`\n=== GET ${path} as an OUTLET ===`);
    console.log(`  rows returned: ${list.length}`);
    console.log('  fields present (names only, no values):');
    console.log(`    ${[...fields].sort().join(', ')}`);
    console.log(
      list.length > rosteredHere
        ? `  >>> RETURNS ${list.length} rows but only ${rosteredHere} PR(s) ever worked here` +
            ' — wider than this venue can justify'
        : '  OK — within the set this venue could justify',
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
