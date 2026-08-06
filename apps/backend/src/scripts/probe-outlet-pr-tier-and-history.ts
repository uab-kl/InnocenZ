/**
 * READ-ONLY probe for two outlet-portal findings:
 *
 *  1. The outlet Today card renders Vicky as "Tier I" while the agency Manage-PR
 *     grid renders her "Tier III". Both map `agency_pr.tier`, but by DIFFERENT
 *     paths: the agency list is scoped to ONE agency (one membership row per
 *     account), the outlet list is scoped by `assignedToOutletIds` and is NOT
 *     agency-scoped — so an account with two memberships comes back TWICE with
 *     the same `id`, and the web's `new Map(prs.map(p => [p.id, p]))` keeps
 *     whichever row happens to be last. Ask the DB how many memberships each
 *     rostered account actually has, and what tier each carries.
 *
 *  2. The outlet Today panel's "Shift history" sheet shows the empty state.
 *     It reads the demo store (now blank), but this also confirms whether
 *     COMPLETED assignments — the rows a backend hydrator would return —
 *     exist at all for those PRs at those outlets.
 *
 * The proposed fix narrows the outlet caller's row set to the membership of the
 * agency that ACTUALLY rostered the PR at the caller's venues. That only holds
 * if every assignment's `agency_id` has a matching `agency_pr` row — otherwise
 * the PR would vanish from the outlet list instead of showing the wrong tier.
 * The last two queries test exactly that, so the fix is not adopted blind.
 *
 * Opens one connection, SELECTs only, writes nothing.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/probe-outlet-pr-tier-and-history.ts
 */
import { Client } from 'pg';
import { env } from '@/env.js';

async function main() {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  // Control: a count I know is non-zero must come back, or the instrument is broken.
  const { rows: control } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM main.agency_pr`,
  );
  console.log(`CONTROL main.agency_pr rows = ${control[0]?.n ?? 'NOT FOUND (probe broken)'}\n`);

  console.log('--- every agency_pr membership, per account, with its tier ---');
  const { rows: memberships } = await client.query(
    `SELECT ap.user_id,
            u.username,
            ap.agency_id,
            a.name        AS agency_name,
            ap.tier,
            ap.approve_status,
            ap.created_at
       FROM main.agency_pr ap
       JOIN main."user" u      ON u.id = ap.user_id
       LEFT JOIN main.agency a ON a.id = ap.agency_id
      ORDER BY u.username, ap.created_at, ap.id`,
  );
  for (const r of memberships) {
    console.log(
      `${String(r.username).padEnd(18)} ${String(r.tier).padEnd(16)} ${String(r.approve_status).padEnd(9)} ${r.agency_name ?? r.agency_id} (${new Date(r.created_at).toISOString()})`,
    );
  }

  console.log('\n--- accounts holding MORE THAN ONE membership (the duplicate-id source) ---');
  const { rows: dupes } = await client.query(
    `SELECT u.username, count(*)::int AS memberships,
            string_agg(ap.tier::text, ' | ' ORDER BY ap.created_at, ap.id) AS tiers
       FROM main.agency_pr ap
       JOIN main."user" u ON u.id = ap.user_id
      GROUP BY u.username
     HAVING count(*) > 1
      ORDER BY u.username`,
  );
  console.log(dupes.length === 0 ? 'none' : JSON.stringify(dupes, null, 2));

  console.log('\n--- shift_assignment by status, per outlet (what history would read) ---');
  const { rows: byStatus } = await client.query(
    `SELECT o.name AS outlet, sa.status, count(*)::int AS n
       FROM main.shift_assignment sa
       JOIN main.shift s  ON s.id = sa.shift_id
       JOIN main.outlet o ON o.id = s.outlet_id
      GROUP BY o.name, sa.status
      ORDER BY o.name, sa.status`,
  );
  for (const r of byStatus) {
    console.log(`${String(r.outlet).padEnd(24)} ${String(r.status).padEnd(12)} ${r.n}`);
  }

  console.log('\n--- assignments whose agency_id has NO agency_pr row for that PR ---');
  console.log('(each of these is a PR the proposed narrowing would DROP from the outlet list)');
  const { rows: orphans } = await client.query(
    `SELECT u.username, o.name AS outlet, sa.agency_id, count(*)::int AS assignments
       FROM main.shift_assignment sa
       JOIN main.shift s  ON s.id = sa.shift_id
       JOIN main.outlet o ON o.id = s.outlet_id
       JOIN main."user" u ON u.id = sa.pr_id
      WHERE NOT EXISTS (
              SELECT 1 FROM main.agency_pr ap
               WHERE ap.user_id = sa.pr_id AND ap.agency_id = sa.agency_id)
      GROUP BY u.username, o.name, sa.agency_id
      ORDER BY u.username`,
  );
  console.log(orphans.length === 0 ? 'none — every assignment resolves a membership' : JSON.stringify(orphans, null, 2));

  console.log('\n--- outlet list AFTER narrowing: one row per (PR, supplying agency) per outlet ---');
  const { rows: narrowed } = await client.query(
    `SELECT o.name AS outlet, u.username, a.name AS supplying_agency, ap.tier
       FROM main.agency_pr ap
       JOIN main."user" u      ON u.id = ap.user_id
       LEFT JOIN main.agency a ON a.id = ap.agency_id
       JOIN main.outlet o      ON EXISTS (
              SELECT 1
                FROM main.shift_assignment sa
                JOIN main.shift s ON s.id = sa.shift_id
               WHERE sa.pr_id = ap.user_id
                 AND sa.agency_id = ap.agency_id
                 AND s.outlet_id = o.id)
      ORDER BY o.name, u.username`,
  );
  for (const r of narrowed) {
    console.log(
      `${String(r.outlet).padEnd(24)} ${String(r.username).padEnd(18)} ${String(r.tier).padEnd(8)} via ${r.supplying_agency}`,
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
