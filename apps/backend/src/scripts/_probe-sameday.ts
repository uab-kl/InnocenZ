/**
 * TWO AGENCIES, ONE DAY — can they both book the same PR, and where does the
 * money go?
 *
 * Victoria is approved at Atlas and at Why We Met. On 18 Aug:
 *   WWM   wants 10:30 - 11:00 at Emhub Testing
 *   Atlas wants 22:00 - 04:00 at Velvet 23      (Emhub -> Velvet is ~65 min)
 * Non-overlapping and 11 hours apart, so the window+travel rule should ALLOW
 * both — which the old whole-day rule would have refused outright.
 *
 * Creates 2 assignments and up to 2 draft vouchers; deletes all of it in a
 * `finally` that re-reads ids from the database and spares anything it did not
 * create. Aborts rather than append to a voucher that already exists.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-sameday.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';

const API = 'http://localhost:7777/api/v1';
const VICKY = '93ea08b0-1911-43c1-8b32-c9c27b2c22b5';
const WWM_SHIFT = 'c83b6d0f-68e1-4e32-a428-925948be09b7'; // 18 Aug 10:30-11:00, Emhub
const ATLAS_SHIFT = '561b043e-92a6-4cf7-8c6c-aec08ae0e451'; // 18 Aug 22:00-04:00, Velvet 23
const WEEK_START = '2026-08-16';

const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}\n        ${detail}`);
}

async function login(email: string, password: string): Promise<string> {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = (await r.json()) as any;
  if (!j?.data?.accessToken) throw new Error(`login failed for ${email}: ${j?.message}`);
  return j.data.accessToken;
}
const call = async (t: string, path: string, init?: RequestInit) => {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  return { status: r.status, body: (await r.json()) as any };
};

const made: string[] = [];
const preVouchers = new Set<string>();
let preAssignments = 0;

async function snapshot() {
  const v = (await db.execute(sql`
    SELECT id FROM main.payment_voucher
    WHERE (pr_id = ${VICKY} OR user_id = ${VICKY}) AND week_start = ${WEEK_START}`)) as any;
  for (const r of (v.rows ?? v) as any[]) preVouchers.add(r.id);
  const a = (await db.execute(sql`
    SELECT count(*)::int AS n FROM main.shift_assignment WHERE pr_id = ${VICKY}`)) as any;
  preAssignments = ((a.rows ?? a) as any[])[0]?.n ?? 0;
  console.log(`  pre: ${preAssignments} assignments, ${preVouchers.size} current-week voucher(s)`);
  // No abort needed: this probe writes NO voucher lines. It creates two
  // assignments and then fires a REFUSAL, which writes nothing — so an existing
  // draft is never appended to and never needs sparing.
  void preVouchers;
}

async function main() {
  await snapshot();
  const wwm = await login('whywemet@agency.com', 'Password123!');
  const atlas = await login('owner@atlas-agency.my', 'Password123!');
  const vicky = await login('pr.vicky@innocenz.demo', 'password').catch(() => null);

  console.log('\n=== 1. CAN BOTH BOOK HER ON THE SAME DAY? ===');
  const a1 = await call(wwm, '/shift-assignment', {
    method: 'POST',
    body: JSON.stringify({ shiftId: WWM_SHIFT, userId: VICKY }),
  });
  if (a1.body?.data?.id) made.push(a1.body.data.id);
  check(
    '1a WWM books her 10:30 - 11:00 at Emhub',
    a1.status === 201,
    `HTTP ${a1.status} · ${a1.body?.data?.id?.slice(0, 8) ?? a1.body?.message}`,
  );

  const a2 = await call(atlas, '/shift-assignment', {
    method: 'POST',
    body: JSON.stringify({ shiftId: ATLAS_SHIFT, userId: VICKY }),
  });
  if (a2.body?.data?.id) made.push(a2.body.data.id);
  check(
    '1b ATLAS books her 22:00 - 04:00 at Velvet 23 — SAME DAY, other agency',
    a2.status === 201,
    `HTTP ${a2.status} · ${a2.body?.data?.id?.slice(0, 8) ?? a2.body?.message}`,
  );
  check(
    '1c (the old whole-day rule would have refused 1b outright)',
    a2.status === 201,
    a2.status === 201 ? 'window+travel allows it: 11 h apart, ~65 min needed' : 'refused',
  );

  if (!vicky) {
    check('2 money', false, 'SKIPPED — could not sign in as Vicky');
    return;
  }

  /*
   * ⚠️ NO VOUCHER LINES ARE WRITTEN HERE, deliberately.
   *
   * Vicky already holds a current-week draft, and `getOrCreateCurrentWeekDraft`
   * REUSES an open one — so sealing wages here would append to somebody's real
   * voucher and leave its total wrong even after the lines were removed. The
   * per-agency filing is already proved on a clean PR by `_e2e-multi-agency.ts`,
   * and it keys off the ASSIGNMENT, which does not care what date it falls on.
   *
   * What is left is the one thing the same-day case adds: with two agencies on a
   * single date, the LINE DATE can no longer say whose money it is. That check is
   * a REFUSAL, so it writes nothing and is free to fire.
   */
  console.log('\n=== 2. AND IF A SELF-LOG DOES NOT NAME ITS SHIFT? ===');
  const bare = await call(vicky, '/payment-voucher/mine/lines', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'wages',
      source: 'manual',
      item: 'probe wage (bare)',
      sales: 0,
      commission: 5,
      lineDate: '2026-08-18',
    }),
  });
  check(
    '2a REFUSED, not guessed — two agencies that day, so the date cannot say whose',
    bare.status === 409,
    `HTTP ${bare.status} · "${bare.body?.message}"`,
  );

  console.log('\n=== SUMMARY ===');
  console.table(results.map((r) => ({ check: r.name, result: r.pass ? 'PASS' : 'FAIL' })));
  console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}

async function cleanup() {
  console.log('\n=== CLEANUP ===');
  try {
    for (const id of made) {
      await db.execute(sql`DELETE FROM main.shift_assignment WHERE id = ${id}`);
    }
    if (made.length) console.log(`  removed ${made.length} assignment(s)`);
    const a = (await db.execute(
      sql`SELECT count(*)::int AS n FROM main.shift_assignment WHERE pr_id = ${VICKY}`,
    )) as any;
    const n = ((a.rows ?? a) as any[])[0]?.n;
    console.log(
      `  Vicky assignments now: ${n} (expected ${preAssignments})` +
        (Number(n) === preAssignments ? '' : '  ⚠️ MISMATCH'),
    );
  } catch (e) {
    console.error('  CLEANUP FAILED:', (e as Error).message);
  }
}

main()
  .catch((e) => console.error('\nPROBE ERROR:', e))
  .finally(async () => {
    await cleanup();
    process.exit(0);
  });
