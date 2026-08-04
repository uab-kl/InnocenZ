/**
 * Merges one payment voucher into another — the deliberate act that
 * `reanchor-voucher-weeks.ts` refuses to perform on its own.
 *
 * READ-ONLY BY DEFAULT:
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/merge-voucher-into.ts --from PV-000005 --into PV-000006
 *
 * Writes only when asked explicitly, and then inside ONE transaction:
 *
 *   ... --from PV-000005 --into PV-000006 --apply
 *
 * Why this exists: the Mon→Sun re-anchor could not move `PV-000005` onto
 * `2026-08-02` because `payment_voucher_one_per_pr_week` already had a row there
 * for the same PR. The two are not a double bill — they are ONE week split
 * across two rows by the old anchor (wages on one, drink commission on the
 * other). The repair is therefore a merge, not a move.
 *
 * ⚠️ The guards below are the point of the script. It REFUSES unless the two
 * vouchers are the same PR, the same agency, both still editable, and every line
 * being moved already falls inside the destination's week. Money is never summed
 * from the old header: the destination's totals are RECOMPUTED from its own lines
 * after the move, so a wrong stored subtotal cannot survive the merge.
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';

const APPLY = process.argv.includes('--apply');

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const FROM_NO = argValue('--from');
const INTO_NO = argValue('--into');

/** A voucher may only be restructured while it is still under review. */
const EDITABLE_STATUSES = new Set(['pending_review', 'draft']);

const iso = (v: unknown): string =>
  v === null || v === undefined ? '—' : String(v).slice(0, 10);

type Voucher = {
  id: string;
  voucher_no: string;
  pr_id: string | null;
  pr_name: string | null;
  agency_id: string | null;
  status: string;
  week_start: string | null;
  week_end: string | null;
  subtotal: string;
  deduction: string;
  net: string;
};

type Line = { id: string; line_date: string | null; amount: string; description: string };

async function loadVoucher(voucherNo: string): Promise<Voucher | null> {
  const r = await db.execute(sql`
    select id, voucher_no, pr_id, pr_name, agency_id, status,
           week_start, week_end, subtotal, deduction, net
      from main.payment_voucher
     where voucher_no = ${voucherNo}
  `);
  return (r.rows[0] as unknown as Voucher) ?? null;
}

async function linesOf(voucherId: string): Promise<Line[]> {
  const r = await db.execute(sql`
    select id, line_date, amount, description
      from main.payment_voucher_line
     where voucher_id = ${voucherId}
     order by line_date
  `);
  return r.rows as unknown as Line[];
}

async function main() {
  if (!FROM_NO || !INTO_NO) {
    console.error('Usage: --from <voucher_no> --into <voucher_no> [--apply]');
    process.exit(1);
  }
  console.log(APPLY ? 'MODE: APPLY (will write)' : 'MODE: report only (writes nothing)');

  const from = await loadVoucher(FROM_NO);
  const into = await loadVoucher(INTO_NO);
  const blocked: string[] = [];

  if (!from) blocked.push(`${FROM_NO} does not exist`);
  if (!into) blocked.push(`${INTO_NO} does not exist`);
  if (!from || !into) {
    for (const b of blocked) console.error(`  REFUSE: ${b}`);
    process.exit(1);
  }

  // --- The guards. Any one of these failing means this is not the situation
  // --- the script was written for, and merging would move somebody's money.
  if (from.id === into.id) blocked.push('source and destination are the same voucher');
  if (from.pr_id !== into.pr_id)
    blocked.push(
      `different PRs — ${from.pr_id} vs ${into.pr_id}. A merge would pay one PR another's work.`,
    );
  if (from.agency_id !== into.agency_id)
    blocked.push(`different agencies — ${from.agency_id} vs ${into.agency_id}`);
  for (const v of [from, into]) {
    if (!EDITABLE_STATUSES.has(v.status))
      blocked.push(
        `${v.voucher_no} is '${v.status}' — a voucher that has been sent, signed or paid is a record, not a draft`,
      );
  }

  const fromLines = await linesOf(from.id);
  const intoLines = await linesOf(into.id);
  const wStart = iso(into.week_start);
  const wEnd = iso(into.week_end);

  const outside = fromLines.filter((l) => {
    const d = iso(l.line_date);
    return d === '—' || d < wStart || d > wEnd;
  });
  if (outside.length > 0) {
    blocked.push(
      `${outside.length} line(s) fall OUTSIDE ${INTO_NO}'s week ${wStart}..${wEnd} — ` +
        outside.map((l) => `${iso(l.line_date)} RM ${l.amount}`).join(', '),
    );
  }

  // Anything else still pointing at the source must come across, or the delete
  // below would either fail on an FK or orphan a receipt the PR uploaded.
  const receipts = await db.execute(sql`
    select id, receipt_no from main.payment_voucher_receipt where voucher_id = ${from.id}
  `);

  console.log(
    `\n  FROM ${from.voucher_no}  ${from.pr_name}  ${from.status}  week ${iso(from.week_start)}..${iso(from.week_end)}  net ${from.net}`,
  );
  for (const l of fromLines)
    console.log(`       ${iso(l.line_date)}  RM ${String(l.amount).padStart(9)}  ${l.description}`);
  console.log(
    `  INTO ${into.voucher_no}  ${into.pr_name}  ${into.status}  week ${wStart}..${wEnd}  net ${into.net}`,
  );
  for (const l of intoLines)
    console.log(`       ${iso(l.line_date)}  RM ${String(l.amount).padStart(9)}  ${l.description}`);
  console.log(`  ${receipts.rows.length} receipt(s) ride along with the move.`);

  // Recomputed from the LINES, never by adding the two stored nets together.
  const cents = (v: string) => Math.round(Number(v) * 100);
  const subtotalCents = [...intoLines, ...fromLines].reduce((s, l) => s + cents(l.amount), 0);
  const netCents = subtotalCents - cents(into.deduction);
  const money = (c: number) => (c / 100).toFixed(2);

  console.log(
    `\n  RESULT: ${into.voucher_no} would hold ${intoLines.length + fromLines.length} line(s), ` +
      `subtotal ${money(subtotalCents)} − deduction ${into.deduction} = NET ${money(netCents)}; ` +
      `${from.voucher_no} would be DELETED.`,
  );

  if (blocked.length > 0) {
    console.error('\nREFUSING TO WRITE:');
    for (const b of blocked) console.error(`  ${b}`);
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\nAll guards passed. Re-run with --apply to write.');
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update main.payment_voucher_line
         set voucher_id = ${into.id}, updated_at = now(), updated_by = 'merge-voucher-into'
       where voucher_id = ${from.id}
    `);
    await tx.execute(sql`
      update main.payment_voucher_receipt
         set voucher_id = ${into.id}, updated_at = now(), updated_by = 'merge-voucher-into'
       where voucher_id = ${from.id}
    `);
    await tx.execute(sql`
      update main.payment_voucher
         set subtotal = ${money(subtotalCents)}, net = ${money(netCents)},
             updated_at = now(), updated_by = 'merge-voucher-into'
       where id = ${into.id}
    `);
    // Only after everything has been re-parented — if any child remains, this
    // throws on its FK and the whole transaction rolls back, which is the point.
    await tx.execute(sql`delete from main.payment_voucher where id = ${from.id}`);
  });

  const after = await loadVoucher(INTO_NO);
  const afterLines = after ? await linesOf(after.id) : [];
  const gone = await loadVoucher(FROM_NO);
  console.log(`\nDone. ${INTO_NO} now holds ${afterLines.length} line(s), net ${after?.net}.`);
  console.log(`${FROM_NO} ${gone ? '⚠️ STILL EXISTS' : 'deleted'}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
