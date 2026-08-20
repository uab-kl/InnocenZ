/**
 * FULL E2E — a PR on two agencies' rosters, end to end, against the live backend.
 *
 * Drives the real HTTP API as three real users (Atlas owner, WWM owner, Alice the
 * PR) and asserts the whole chain: the narrowed cross-agency assign rule, the
 * anonymous refusals, per-agency voucher filing, per-voucher attribution on the
 * PR's own reads, and the dispute parent-check.
 *
 * EVERYTHING IT CREATES, IT DELETES. Cleanup runs in a `finally` and prints what
 * it removed plus the expected end state, so a failed run cannot quietly leave
 * money rows behind. It re-reads the voucher ids from the database rather than
 * trusting its own in-memory list — a run that died midway still tidies up.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_e2e-multi-agency.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';

const API = 'http://localhost:7777/api/v1';
const ALICE = '1cfade6c-166a-40ee-bc9a-40eecb3f88fb';
const WWM_ASSIGNMENT = '0c00ab15-b4ba-4138-8689-726a876e4fe3'; // WWM, 18 Aug, JK House
const ATLAS_SHIFT = 'd6a32055-c7c3-4a1b-85c5-44618d743651'; // Atlas, 20 Aug 11:00-12:00
const OVERLAP_SHIFT = '561b043e-92a6-4cf7-8c6c-aec08ae0e451'; // Atlas, 18 Aug 22:00-04:00
const WEEK_START = '2026-08-16';

type R = { name: string; pass: boolean; detail: string };
const results: R[] = [];
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

const created = { assignmentId: null as string | null };

/**
 * ⚠️ THE VOUCHERS THAT WERE ALREADY THERE — captured BEFORE anything is written,
 * and the reason this harness is safe to run on a shared database.
 *
 * Cleanup used to delete every current-week voucher Alice owned, on the theory
 * that the run had created all of them. It had not, and could not: the money
 * writers go through `getOrCreateCurrentWeekDraft`, which REUSES an existing
 * draft rather than minting a run-scoped one. So on any week where Alice already
 * had a voucher — the weekly generator, a coworker's session, a genuine
 * check-out — this run would append its two test lines to that real voucher and
 * then delete the whole row, taking its real lines, receipts, day-reviews and
 * disputes with it, and print "expected 0" as though that were success. Worse on
 * a run that dies at `login`: `finally` still fires and it would wipe data it had
 * not even had the chance to touch.
 *
 * Anything in this set is NOT the run's to delete.
 */
const preExisting = new Set<string>();

/**
 * How many assignments the PR held BEFORE this run — snapshotted, never assumed.
 *
 * ⚠️ This was hardcoded as "expected 13", which was true at the moment the harness
 * was written and stopped being true the first time a human booked her: a real
 * 21 Aug assignment appeared mid-session and the run reported "14 (expected 13)",
 * i.e. a false alarm that reads exactly like a cleanup failure. A test that
 * hardcodes the state of a SHARED database is a test that cries wolf, and the
 * next person to see it will start ignoring the line that actually matters.
 */
let preAssignments = 0;

/** The marker every line this harness writes carries, so cleanup can find them. */
const E2E_TAG = 'E2E wage';

async function snapshot() {
  const rows = (await db.execute(sql`
    SELECT id FROM main.payment_voucher
    WHERE (pr_id = ${ALICE} OR user_id = ${ALICE}) AND week_start = ${WEEK_START}`)) as any;
  for (const r of (rows.rows ?? rows) as any[]) preExisting.add(r.id);
  const n = (await db.execute(sql`
    SELECT count(*)::int AS n FROM main.shift_assignment WHERE pr_id = ${ALICE}`)) as any;
  preAssignments = ((n.rows ?? n) as any[])[0]?.n ?? 0;
  console.log(`  pre-existing assignments: ${preAssignments}`);
  console.log(
    `  pre-existing current-week vouchers: ${preExisting.size}` +
      (preExisting.size ? ' — these will NOT be deleted' : ''),
  );

  /*
   * ⚠️ REFUSE TO RUN ON TOP OF AN EXISTING CURRENT-WEEK VOUCHER.
   *
   * Sparing it is not enough. The money writers go through
   * `getOrCreateCurrentWeekDraft`, which REUSES that voucher, so this run would
   * append its test lines to somebody's real payslip. Two things then go wrong
   * and only one of them is recoverable: deleting the tagged lines afterwards
   * leaves the voucher's `net` still carrying their value (seen live — a RM999
   * decoy came back as RM1,221 with its own line intact but its total wrong),
   * and the assertions themselves turn unsound, because "this voucher's net"
   * is no longer the run's own money.
   *
   * A harness that cannot cleanly undo itself must not start. Aborting is the
   * honest outcome; the operator can pick a quiet week or clear the draft first.
   */
  if (preExisting.size > 0) {
    console.error(
      `\n  ABORTED — Alice already has ${preExisting.size} voucher(s) for week ${WEEK_START}.\n` +
        '  This harness would APPEND its test lines to them (getOrCreateCurrentWeekDraft\n' +
        '  reuses an open draft) and could not restore their totals afterwards.\n' +
        '  Clear or settle that week first, then re-run.',
    );
    process.exit(1);
  }
}

async function main() {
  await snapshot();
  const atlas = await login('owner@atlas-agency.my', 'Password123!');
  await login('whywemet@agency.com', 'Password123!'); // proves the WWM account too
  const alice = await login('pr.alice@innocenz.demo', 'password');

  console.log('\n=== 1. THE ASSIGN RULE — window + travel, not the whole day ===');

  const clash = await call(atlas, '/shift-assignment', {
    method: 'POST',
    body: JSON.stringify({ shiftId: OVERLAP_SHIFT, userId: ALICE }),
  });
  check(
    '1a Atlas is REFUSED a slot overlapping her WWM shift',
    clash.status === 400,
    `HTTP ${clash.status} · "${clash.body.message}"`,
  );
  check(
    '1b ...and the refusal is ANONYMOUS (names no agency, venue or hour)',
    !/why we met|atlas|jk house|velvet|emhub|15:00|04:00/i.test(clash.body.message ?? ''),
    `"${clash.body.message}"`,
  );

  const ok = await call(atlas, '/shift-assignment', {
    method: 'POST',
    body: JSON.stringify({ shiftId: ATLAS_SHIFT, userId: ALICE }),
  });
  created.assignmentId = ok.body?.data?.id ?? null;
  check(
    '1c Atlas CAN book her on a non-conflicting day of the same week',
    ok.status === 201 && !!created.assignmentId,
    `HTTP ${ok.status} · assignment ${created.assignmentId?.slice(0, 8) ?? '—'}`,
  );
  check(
    '1d ...and the row is stamped with the ACTING agency',
    !!ok.body?.data?.agencyId,
    `agencyId=${ok.body?.data?.agencyId?.slice(0, 8)}`,
  );

  console.log('\n=== 2. MONEY — each agency gets its OWN voucher ===');

  const wageWwm = await call(alice, '/payment-voucher/mine/lines', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'wages',
      source: 'checkin',
      item: 'E2E wage (WWM)',
      sales: 0,
      commission: 111,
      lineDate: '2026-08-18',
      dedupeRef: WWM_ASSIGNMENT,
    }),
  });
  check(
    '2a Alice check-out seal for her WWM shift is accepted',
    wageWwm.status === 201,
    `HTTP ${wageWwm.status} · ${wageWwm.body?.data?.id?.slice(0, 8) ?? wageWwm.body?.message}`,
  );

  const wageAtlas = await call(alice, '/payment-voucher/mine/lines', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'wages',
      source: 'checkin',
      item: 'E2E wage (Atlas)',
      sales: 0,
      commission: 222,
      lineDate: '2026-08-20',
      dedupeRef: created.assignmentId,
    }),
  });
  check(
    '2b Alice check-out seal for her Atlas shift is accepted',
    wageAtlas.status === 201,
    `HTTP ${wageAtlas.status} · ${wageAtlas.body?.data?.id?.slice(0, 8) ?? wageAtlas.body?.message}`,
  );

  const rows = (await db.execute(sql`
    SELECT a.name AS agency, pv.id, l.description, l.amount
    FROM main.payment_voucher pv
    JOIN main.agency a ON a.id = pv.agency_id
    JOIN main.payment_voucher_line l ON l.voucher_id = pv.id
    WHERE (pv.pr_id = ${ALICE} OR pv.user_id = ${ALICE}) AND pv.week_start = ${WEEK_START}
    ORDER BY a.name`)) as any;
  const filed = (rows.rows ?? rows) as any[];
  console.table(filed.map((f) => ({ agency: f.agency, line: f.description, amount: f.amount })));

  const wwmLine = filed.find((f) => f.description === 'E2E wage (WWM)');
  const atlasLine = filed.find((f) => f.description === 'E2E wage (Atlas)');
  check(
    "2c WWM's wage landed on a WHY WE MET voucher (old code filed it under Atlas)",
    wwmLine?.agency === 'Why We Met Agency',
    `filed under "${wwmLine?.agency}"`,
  );
  check(
    "2d Atlas's wage landed on an ATLAS voucher",
    atlasLine?.agency === 'Atlas Agency',
    `filed under "${atlasLine?.agency}"`,
  );
  check(
    '2e the two are DIFFERENT vouchers in the SAME week (no double-billing)',
    !!wwmLine && !!atlasLine && wwmLine.id !== atlasLine.id,
    `${wwmLine?.id?.slice(0, 8)} vs ${atlasLine?.id?.slice(0, 8)}`,
  );

  console.log('\n=== 3. WHAT ALICE SEES — attribution on her own reads ===');

  const week = await call(alice, '/payment-voucher/mine/current-week');
  const vouchers = week.body?.data?.vouchers ?? [];
  const lines = week.body?.data?.lines ?? [];
  console.table(vouchers.map((v: any) => ({ agency: v.agencyName, net: v.net, status: v.status })));
  check(
    '3a her week returns BOTH vouchers, each NAMED by its agency',
    vouchers.length >= 2 &&
      vouchers.some((v: any) => v.agencyName === 'Atlas Agency') &&
      vouchers.some((v: any) => v.agencyName === 'Why We Met Agency'),
    vouchers.map((v: any) => v.agencyName).join(' | '),
  );

  const e2eLines = lines.filter((l: any) => String(l.item).startsWith('E2E wage'));
  check(
    '3b every line carries its OWN voucherId, so the app can attribute it',
    e2eLines.length === 2 && e2eLines.every((l: any) => !!l.voucherId),
    e2eLines.map((l: any) => `${l.item}->${l.voucherId?.slice(0, 8)}`).join(' | '),
  );

  const wwmVoucher = vouchers.find((v: any) => v.agencyName === 'Why We Met Agency');
  const atlasVoucher = vouchers.find((v: any) => v.agencyName === 'Atlas Agency');
  check(
    '3c each line points at the voucher of the agency that SOLD that shift',
    e2eLines.find((l: any) => l.item.includes('WWM'))?.voucherId === wwmVoucher?.id &&
      e2eLines.find((l: any) => l.item.includes('Atlas'))?.voucherId === atlasVoucher?.id,
    `WWM line -> ${wwmVoucher?.agencyName} · Atlas line -> ${atlasVoucher?.agencyName}`,
  );
  const merged = Number(week.body?.data?.net ?? 0);
  const parts = Number(wwmVoucher?.net ?? 0) + Number(atlasVoucher?.net ?? 0);
  check(
    '3d the WEEK total is the sum, while each voucher keeps its own net',
    Math.abs(merged - parts) < 0.01,
    `week ${merged} = ${wwmVoucher?.net} (WWM) + ${atlasVoucher?.net} (Atlas)`,
  );

  console.log('\n=== 4. THE DISPUTE PARENT-CHECK ===');
  const receipts = (await db.execute(sql`
    SELECT r.id, a.name AS agency
    FROM main.payment_voucher_receipt r
    JOIN main.payment_voucher pv ON pv.id = r.voucher_id
    JOIN main.agency a ON a.id = pv.agency_id
    WHERE (pv.pr_id = ${ALICE} OR pv.user_id = ${ALICE})
      AND pv.id <> ${atlasVoucher?.id ?? '00000000-0000-0000-0000-000000000000'}
    LIMIT 1`)) as any;
  const foreign = (receipts.rows ?? receipts)[0];
  if (foreign && atlasVoucher) {
    const bad = await call(alice, `/payment-voucher/mine/${atlasVoucher.id}/dispute`, {
      method: 'POST',
      // ⚠️ 2026-08-20 ON PURPOSE — the date Atlas's voucher DOES have a line on.
      // Aim at a date it has nothing on and the older `voucherHasDate` guard
      // answers first, and this test passes without ever exercising the receipt
      // parent-check. The dangerous case is precisely the one where the day looks
      // fine and only the RECEIPT is foreign.
      body: JSON.stringify({
        disputeDate: '2026-08-20',
        component: 'drinks',
        reason: 'wrong_amount',
        receiptId: foreign.id,
      }),
    });
    check(
      '4a a receipt from ANOTHER voucher is refused (was filed silently at RM 0.00)',
      bad.status === 400 && /not on this voucher/i.test(bad.body.message ?? ''),
      `HTTP ${bad.status} · "${bad.body.message}"`,
    );
  } else {
    check('4a dispute parent-check', true, 'SKIPPED — no foreign receipt exists to fire it with');
  }

  console.log('\n=== 5. SIGNING — the right document, for the right money ===');
  /*
   * A draft is `pending_review` and the server rightly refuses to let a PR sign
   * one ("this voucher has not been sent to you yet"). Issuing is the agency's
   * act and is not what this section is testing, so the two are moved to the
   * state the signing rules actually apply to — `sent` for WWM's, left
   * `pending_review` for Atlas's, which is the exact mixed pair that used to
   * make the to-do vanish.
   */
  if (wwmVoucher && atlasVoucher) {
    await db.execute(
      sql`UPDATE main.payment_voucher SET status = 'sent' WHERE id = ${wwmVoucher.id}`,
    );

    const lastWeekBefore = await call(alice, '/payment-voucher/mine/current-week');
    const vBefore = lastWeekBefore.body?.data?.vouchers ?? [];
    check(
      '5a a SENT voucher and a PENDING one are reported separately, not merged',
      vBefore.find((v: any) => v.id === wwmVoucher.id)?.status === 'sent' &&
        vBefore.find((v: any) => v.id === atlasVoucher.id)?.status === 'pending_review',
      vBefore.map((v: any) => `${v.agencyName}=${v.status}`).join(' | '),
    );

    const signed = await call(alice, `/payment-voucher/mine/${wwmVoucher.id}/sign`, {
      method: 'POST',
      // Stroke geometry, not an image — see PrSignVoucherSchema.
      body: JSON.stringify({
        signature: { w: 300, h: 120, strokes: [[[10, 60], [90, 30], [170, 80], [260, 40]]] },
      }),
    });
    check(
      "5b Alice can sign the NON-headline voucher (it used to be unreachable)",
      signed.status === 200,
      `HTTP ${signed.status} · "${signed.body.message}"`,
    );

    const after = (await db.execute(sql`
      SELECT a.name AS agency, pv.status, pv.net, pv.pr_signed_at
      FROM main.payment_voucher pv JOIN main.agency a ON a.id = pv.agency_id
      WHERE pv.id IN (${wwmVoucher.id}, ${atlasVoucher.id}) ORDER BY a.name`)) as any;
    const rowsAfter = (after.rows ?? after) as any[];
    console.table(
      rowsAfter.map((r) => ({
        agency: r.agency,
        status: r.status,
        net: r.net,
        signed: r.pr_signed_at ? 'yes' : 'no',
      })),
    );
    const wwmAfter = rowsAfter.find((r) => r.agency === 'Why We Met Agency');
    const atlasAfter = rowsAfter.find((r) => r.agency === 'Atlas Agency');
    check(
      "5c ONLY WWM's voucher was signed — Atlas's is untouched",
      wwmAfter?.status === 'signed' && !!wwmAfter?.pr_signed_at && !atlasAfter?.pr_signed_at,
      `WWM=${wwmAfter?.status}/${wwmAfter?.pr_signed_at ? 'signed' : 'unsigned'} · Atlas=${atlasAfter?.status}/${atlasAfter?.pr_signed_at ? 'signed' : 'unsigned'}`,
    );
    check(
      '5d the signed voucher still carries ITS OWN net, not the week total',
      Number(wwmAfter?.net) === 111,
      `sealed at ${wwmAfter?.net} (its own), week total was ${merged}`,
    );
    check(
      "5e Atlas's voucher is STILL outstanding after WWM's was signed",
      Number(atlasAfter?.net) === 222 && atlasAfter?.status === 'pending_review',
      `Atlas ${atlasAfter?.net} · ${atlasAfter?.status}`,
    );
  } else {
    check('5a-5e signing', false, 'could not resolve both vouchers');
  }

  console.log('\n=== 6. HISTORY — vouchers told apart by agency ===');
  /*
   * ⚠️ The CURRENT week is deliberately absent here — `getMyHistory` passes
   * `excludeWeekStart: currentWeekStart` so the live draft stays in the This-week
   * section instead of being listed twice. So this section cannot assert on the
   * vouchers this run created; it checks the agency join against the PR's real
   * history, which is the thing that was missing.
   */
  const hist = await call(alice, '/payment-voucher/mine/history');
  const weeks = (hist.body?.data ?? []) as any[];
  const truth = (await db.execute(sql`
    SELECT pv.id, a.name AS agency FROM main.payment_voucher pv
    JOIN main.agency a ON a.id = pv.agency_id
    WHERE pv.pr_id = ${ALICE} OR pv.user_id = ${ALICE}`)) as any;
  const byId = new Map(
    ((truth.rows ?? truth) as any[]).map((r) => [r.id, r.agency] as [string, string]),
  );
  check(
    '6a every history row carries an agencyName (the field was absent entirely)',
    weeks.length > 0 && weeks.every((w: any) => !!w.agencyName),
    `${weeks.length} row(s): ${weeks.map((w: any) => `${w.agencyName}/${w.weekStart}`).join(' | ')}`,
  );
  check(
    "6b ...and each one MATCHES that voucher's real agency in the database",
    weeks.length > 0 && weeks.every((w: any) => w.agencyName === byId.get(w.voucherId)),
    weeks
      .map((w: any) => `${w.voucherNo ?? w.voucherId.slice(0, 8)}: api="${w.agencyName}" db="${byId.get(w.voucherId)}"`)
      .join(' | '),
  );

  console.log('\n=== SUMMARY ===');
  console.table(results.map((r) => ({ check: r.name, result: r.pass ? 'PASS' : 'FAIL' })));
  console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}

async function cleanup() {
  console.log('\n=== CLEANUP — removing everything this run created ===');
  try {
    /*
     * ⚠️ DELETE ONLY WHAT THIS RUN CREATED.
     *
     * Two steps, and the order matters. First strip THIS run's tagged lines from
     * wherever they landed — including a voucher that already existed, which
     * `getOrCreateCurrentWeekDraft` will happily have reused. Only then drop the
     * vouchers, and only those absent from the pre-run snapshot.
     *
     * Re-reading the id list is still right (a run that died midway may have
     * created a voucher nothing recorded), but re-reading is NOT a licence to
     * delete: `preExisting` is what separates "mine" from "someone else's".
     */
    const removedLines = (await db.execute(sql`
      DELETE FROM main.payment_voucher_line
      WHERE description LIKE ${`${E2E_TAG}%`}
        AND voucher_id IN (
          SELECT id FROM main.payment_voucher
          WHERE (pr_id = ${ALICE} OR user_id = ${ALICE}) AND week_start = ${WEEK_START}
        )
      RETURNING id`)) as any;
    const nLines = ((removedLines.rows ?? removedLines) as any[]).length;
    if (nLines) console.log(`  removed ${nLines} tagged E2E line(s)`);

    const mine = (await db.execute(sql`
      SELECT id FROM main.payment_voucher
      WHERE (pr_id = ${ALICE} OR user_id = ${ALICE}) AND week_start = ${WEEK_START}`)) as any;
    const ids = ((mine.rows ?? mine) as any[])
      .map((r) => r.id)
      .filter((id: string) => !preExisting.has(id));
    const spared = ((mine.rows ?? mine) as any[]).length - ids.length;
    if (spared > 0) console.log(`  SPARED ${spared} pre-existing voucher(s) — not this run's`);
    if (ids.length) {
      const list = sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      );
      await db.execute(sql`DELETE FROM main.payment_voucher_dispute WHERE voucher_id IN (${list})`);
      await db.execute(sql`DELETE FROM main.payment_voucher_line WHERE voucher_id IN (${list})`);
      await db.execute(
        sql`DELETE FROM main.payment_voucher_day_review WHERE voucher_id IN (${list})`,
      );
      await db.execute(sql`DELETE FROM main.payment_voucher_receipt WHERE voucher_id IN (${list})`);
      await db.execute(sql`DELETE FROM main.payment_voucher WHERE id IN (${list})`);
      console.log(`  removed ${ids.length} current-week voucher(s) and their lines`);
    }
    if (created.assignmentId) {
      await db.execute(sql`DELETE FROM main.shift_assignment WHERE id = ${created.assignmentId}`);
      console.log(`  removed assignment ${created.assignmentId.slice(0, 8)}`);
    }
    const left = (await db.execute(sql`
      SELECT count(*)::int AS n FROM main.payment_voucher
      WHERE (pr_id = ${ALICE} OR user_id = ${ALICE}) AND week_start = ${WEEK_START}`)) as any;
    const total = (await db.execute(
      sql`SELECT count(*)::int AS n FROM main.shift_assignment WHERE pr_id = ${ALICE}`,
    )) as any;
    // Expected = what was there BEFORE, not zero. Zero was only ever right
    // because Alice happened to have no current-week voucher; asserting it would
    // have reported a successful wipe of somebody's real money as a pass.
    const now = (left.rows ?? left)[0]?.n;
    console.log(
      `  Alice current-week vouchers now: ${now} (expected ${preExisting.size})` +
        (Number(now) === preExisting.size ? '' : '  ⚠️ MISMATCH'),
    );
    const nowA = (total.rows ?? total)[0]?.n;
    console.log(
      `  Alice assignments now: ${nowA} (expected ${preAssignments})` +
        (Number(nowA) === preAssignments ? '' : '  ⚠️ MISMATCH'),
    );
  } catch (e) {
    console.error('  CLEANUP FAILED:', (e as Error).message);
  }
}

main()
  .catch((e) => {
    console.error('\nE2E ERROR:', e);
  })
  .finally(async () => {
    await cleanup();
    process.exit(0);
  });
