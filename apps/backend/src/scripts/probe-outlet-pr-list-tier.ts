/**
 * Fires the two reads behind the outlet Today panel, as a real OUTLET owner
 * against a running server.
 *
 * 1. `GET /pr` — the PR cards. The claim under test: an outlet caller's PR list
 *    used to emit one row per `agency_pr` MEMBERSHIP, so an account with two
 *    memberships came back twice under the same `id` with two different tiers,
 *    and the web (which keys those rows by id) kept whichever landed last. Vicky
 *    read "Tier I" from her Delta membership on an Atlas-supplied night. The fix
 *    narrows the outlet filter to the membership of the agency that actually
 *    supplied the PR to that venue.
 *
 * 2. `GET /shift-assignment?status=completed` — the rows the "Shift history"
 *    sheet now hydrates from (useOutletHistory). It used to read only the demo
 *    store, so it showed "No shift history yet" for PRs who had sealed nights.
 *    A row is usable by the sheet only if it carries `prName` AND `shiftDate`;
 *    the hydrator drops any row missing either, so both are asserted here.
 *
 * READ-ONLY: a login plus two GETs. Nothing is written.
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-outlet-pr-list-tier.ts
 */
import '@/env.js';

const BASE = process.env.PROBE_API_URL ?? 'http://localhost:7777/api/v1';
const OUTLET_EMAIL = process.env.PROBE_OUTLET_EMAIL ?? 'owner@velvet23.my';
const ORG_PASSWORD = process.env.PROBE_ORG_PASSWORD ?? 'Password123!';

type Body = { message?: string; data?: unknown; pagination?: { totalCount?: number } };

async function call(path: string, token?: string): Promise<{ status: number; body: Body }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  let body: Body = {};
  try {
    body = (await res.json()) as Body;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`\nOUTLET PR LIST — live over HTTP against ${BASE}\n`);

  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OUTLET_EMAIL, password: ORG_PASSWORD }),
  });
  const loginBody = (await loginRes.json()) as { data?: { accessToken?: string } };
  const token = loginBody.data?.accessToken;
  if (!token) {
    console.error(`  ABORT — could not log in as ${OUTLET_EMAIL} (status ${loginRes.status})`);
    process.exit(1);
  }
  console.log(`  logged in as ${OUTLET_EMAIL}\n`);

  const { status, body } = await call('/pr?pageSize=500', token);
  if (status !== 200) {
    console.error(`  ABORT — GET /pr returned ${status}: ${body.message}`);
    process.exit(1);
  }

  const rows = (body.data ?? []) as Array<{
    id: string;
    nickname: string | null;
    name: string;
    tier: string;
    agencyId: string;
  }>;
  console.log(`  ${rows.length} rows, pagination.totalCount = ${body.pagination?.totalCount}\n`);
  for (const r of rows) {
    console.log(`    ${String(r.nickname ?? r.name).padEnd(18)} ${r.tier.padEnd(8)} agency=${r.agencyId}`);
  }

  const seen = new Map<string, string[]>();
  for (const r of rows) seen.set(r.id, [...(seen.get(r.id) ?? []), r.tier]);
  const duplicated = [...seen.entries()].filter(([, tiers]) => tiers.length > 1);

  console.log('');
  if (duplicated.length === 0) {
    console.log('  PASS  one row per PR — no id appears twice');
  } else {
    console.log('  FAIL  duplicate ids, each with its own tier:');
    for (const [id, tiers] of duplicated) console.log(`          ${id} -> ${tiers.join(' | ')}`);
  }

  // Vicky is tier_3 at Atlas and tier_1 at Delta, and Atlas is who supplies her
  // to this venue — so the outlet must read tier_3.
  const vicky = rows.filter((r) => (r.nickname ?? r.name) === 'Vicky');
  if (vicky.length === 0) {
    console.log("  SKIP  Vicky is not rostered at this caller's venues — nothing to compare");
  } else if (vicky.length === 1 && vicky[0]!.tier === 'tier_3') {
    console.log('  PASS  Vicky reads tier_3 (Atlas, the supplying agency)');
  } else {
    console.log(`  FAIL  Vicky reads ${vicky.map((v) => v.tier).join(' | ')} — expected a single tier_3`);
  }

  // --- 2. the Shift history sheet's new source ---
  console.log('\n  GET /shift-assignment?status=completed  (what the sheet hydrates from)');
  const hist = await call('/shift-assignment?status=completed&pageSize=500', token);
  if (hist.status !== 200) {
    console.log(`  FAIL  returned ${hist.status}: ${hist.body.message}`);
    return;
  }
  const assignments = (hist.body.data ?? []) as Array<{
    id: string;
    prId: string;
    prName?: string | null;
    shiftDate?: string | null;
    status: string;
    payAmount?: string | null;
  }>;
  const usable = assignments.filter((a) => a.prName && a.shiftDate);
  console.log(`  ${assignments.length} completed rows, ${usable.length} usable by the sheet`);
  const byPr = new Map<string, number>();
  for (const a of usable) byPr.set(a.prName!, (byPr.get(a.prName!) ?? 0) + 1);
  for (const [name, n] of byPr) console.log(`    ${name.padEnd(18)} ${n} sealed night${n === 1 ? '' : 's'}`);

  if (assignments.length === 0) {
    console.log('  SKIP  no completed assignments at this venue — nothing for the sheet to show');
  } else if (usable.length === assignments.length) {
    console.log('  PASS  every completed row carries prName + shiftDate');
  } else {
    console.log(
      `  FAIL  ${assignments.length - usable.length} row(s) missing prName or shiftDate — the sheet silently drops those`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
