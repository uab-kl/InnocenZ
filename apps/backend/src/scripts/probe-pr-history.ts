/**
 * READ-ONLY. What `GET /payment-voucher/mine/history` now returns for each PR,
 * beside what the old signed/paid-only filter returned — the difference is what
 * the PR app's History tabs were missing.
 *
 * Calls the repository the controller calls, so this proves the query and not a
 * hand-written copy of it. SELECTs only; safe against the shared database.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-pr-history.ts
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { PaymentVoucherRepositoryClass } from '@/features/payment-voucher/payment-voucher.repository.js';
import { klToday, weekOfDate } from '@/features/payment-voucher/payment-voucher-week.js';

const paymentVoucherRepository = new PaymentVoucherRepositoryClass();

/** Mirrors KIND_BY_COMPONENT in payment-voucher-component.ts (not exported). */
const KIND_BY_COMPONENT: Record<string, string> = {
  wages: 'wages',
  drink_commission: 'drinks',
  tip_commission: 'tips',
  ot: 'others',
  deduction: 'others',
  other: 'others',
};

/**
 * Sunday starting the current payroll week in Asia/Kuala_Lumpur.
 *
 * 🔴 This was a hand-rolled MONDAY (`back = dow === 0 ? 6 : dow - 1`) whose
 * comment claimed it matched the controller. It did — until the payroll anchor
 * moved to Sunday on 3 Aug 2026, and a copy cannot follow a change it does not
 * import. The value is passed straight into `excludeWeekStart`, which compares
 * against `payment_voucher.week_start` — always a SUNDAY — so the Monday copy
 * excluded a week that does not exist: the live current-week voucher survived
 * the filter and the probe would have reported it as history, i.e. claimed the
 * PR app shows a week it deliberately hides. On a Sunday it went the other way
 * and excluded the week before.
 *
 * Now derived from the same functions the controller uses, so it cannot drift
 * again.
 */
function currentWeekStart(): string {
  const week = weekOfDate(klToday());
  if (!week) throw new Error('could not derive the current payroll week');
  return week.weekStart;
}

async function main() {
  const weekStart = currentWeekStart();
  console.log('Current week start (excluded from history):', weekStart);

  const prs = await db.execute(sql`
    select p.id, p.name from main.pr p
     where exists (select 1 from main.payment_voucher v where v.pr_id = p.id)
     order by p.name
  `);

  for (const row of prs.rows as { id: string; name: string }[]) {
    const before = await paymentVoucherRepository.listHistoryForPr(row.id, {
      statuses: ['signed', 'paid'],
      excludeWeekStart: weekStart,
    });
    const after = await paymentVoucherRepository.listHistoryForPr(row.id, {
      statuses: ['pending_review', 'sent', 'signed', 'paid', 'disputed'],
      excludeWeekStart: weekStart,
    });
    console.log(`\n${row.name}`);
    console.log(`  old filter (signed+paid): ${before.length} week(s)`);
    console.log(`  new filter (all closed):  ${after.length} week(s)`);
    for (const v of after) {
      // What the client will print: only a genuinely paid voucher reads "Paid".
      const badge = v.status === 'paid' ? 'Paid' : 'Signed';
      console.log(
        `    ${v.voucherNo} ${v.weekStart}..${v.weekEnd} net=${v.net} db_status=${v.status} -> shows "${badge}" · ${v.lines.length} line(s)`,
      );
      // lineDate drives the Shifts tab's per-day cards; a null one is silently
      // dropped there, so print it rather than trusting the count above.
      //
      // `old bucket` is what the ref alone said (the bug: a bare assignment id
      // has no packed kind, so it fell through to 'others'); `NEW bucket` is what
      // the component column says, which is what the PR now sees.
      for (const l of v.lines) {
        const packed = (l.ref ?? '').includes('|');
        const oldKind = packed ? (l.ref ?? '').split('|')[0] : 'others';
        const newKind = packed ? oldKind : (KIND_BY_COMPONENT[l.component ?? ''] ?? 'others');
        const moved = oldKind === newKind ? '' : '   <-- MOVED';
        console.log(
          `      ${l.lineDate ?? 'NULL'} ${l.outlet ?? 'NULL'} RM ${l.amount} component=${l.component ?? 'NULL'} old bucket=${oldKind} NEW bucket=${newKind}${moved}`,
        );
      }
    }
  }

  // Why a voucher has not reached 'signed' — the only status the agency's
  // "Payment Week" tab renders. Prints the send gate's inputs: undecided days,
  // pending receipts, and whether the PR has signed.
  const gate = await db.execute(sql`
    select v.voucher_no, v.status, v.week_start, v.pr_signed_at, v.paid_at,
           (select count(distinct l.line_date) from main.payment_voucher_line l
             where l.voucher_id = v.id and l.line_date is not null) as work_days,
           (select count(*) from main.payment_voucher_day_review d
             where d.voucher_id = v.id) as days_reviewed,
           (select count(*) from main.payment_voucher_day_review d
             where d.voucher_id = v.id and d.status = 'held') as days_held,
           (select count(*) from main.payment_voucher_receipt r
             where r.voucher_id = v.id and r.status = 'pending') as receipts_pending
      from main.payment_voucher v
     order by v.week_start desc
  `);
  console.log('\nSEND GATE (why a voucher is not yet "signed"):');
  for (const r of gate.rows) console.log(JSON.stringify(r));

  // Re-anchoring the payroll week Mon–Sun -> Sun–Sat shifts every week boundary
  // back one day. A line only CHANGES VOUCHER if it falls on a Sunday, so that
  // is the one thing to check before rewriting any week column.
  const sundayLines = await db.execute(sql`
    select v.voucher_no, l.line_date, l.amount, l.outlet,
           to_char(l.line_date, 'Dy') as weekday
      from main.payment_voucher_line l
      join main.payment_voucher v on v.id = l.voucher_id
     where l.line_date is not null
     order by l.line_date
  `);
  console.log('\nEVERY LINE BY WEEKDAY (a SUNDAY line would move voucher on re-anchor):');
  for (const r of sundayLines.rows) console.log(JSON.stringify(r));

  const issued = await db.execute(sql`
    select voucher_no, status, issued_date, due_date, week_start, week_end,
           to_char(week_start, 'Dy') as week_start_day
      from main.payment_voucher order by week_start desc
  `);
  console.log('\nISSUED DATES:');
  for (const r of issued.rows) console.log(JSON.stringify(r));

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
