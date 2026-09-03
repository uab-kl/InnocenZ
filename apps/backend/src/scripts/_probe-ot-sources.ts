/**
 * READ-ONLY. Two guards on the outlet's PR-spend figure, each fired at
 * something that would actually break it.
 *
 *  1. The overtime STATUS gate. Live data cannot test it — every non-approved
 *     claim happens to hold 0, so removing the gate changes no total and a
 *     green check would prove nothing. Fired at a synthetic set instead.
 *  2. The DEDUCTION exclusion. A deduction is a penalty the agency levied on
 *     its PR and an outlet must not see it. Fired at the real deduction rows,
 *     asserting they reach no outlet-facing figure.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-ot-sources.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import { ShiftAssignmentRepositoryClass } from '../features/shift-assignment/shift-assignment.repository';

async function main() {
  // --- 1. Overtime status gate -------------------------------------------
  const r = await db.execute(sql`
    with claims(overtime_status, overtime_amount) as (
      values ('approved', 100.00::numeric),
             ('rejected',  50.00::numeric),
             ('pending',   25.00::numeric),
             (null,        null::numeric)
    )
    select coalesce(sum(
             case when overtime_status = 'approved' then overtime_amount end
           ), 0)::float8 as gated,
           coalesce(sum(overtime_amount), 0)::float8 as ungated
      from claims
  `);
  const { gated, ungated } = r.rows[0] as unknown as { gated: number; ungated: number };
  console.log('\n=== [1] overtime status gate, against a set that can break it ===');
  console.log('  approved 100 · rejected 50 · pending 25 · undecided null');
  console.log(`  shipped expression (gated): RM ${gated.toFixed(2)}`);
  console.log(`  no gate at all            : RM ${ungated.toFixed(2)}`);
  console.log(
    gated === 100 && ungated === 175
      ? '  ✅ excludes RM 75.00 of unapproved overtime — the gate discriminates'
      : '  *** GATE DOES NOT DISCRIMINATE ***',
  );

  // --- 2. Deductions must not reach an outlet ------------------------------
  const deductions = await db.execute(sql`
    select o.name as outlet,
           s.shift_date,
           coalesce(nullif(trim(u.username), ''), 'PR') as pr,
           l.amount::float8 as amount
      from main.payment_voucher_line l
      join main.payment_voucher_receipt r on r.id = l.receipt_id
      join main.shift_assignment sa on sa.id = r.shift_assignment_id
      join main.shift s on s.id = sa.shift_id
      join main.outlet o on o.id = s.outlet_id
      left join main."user" u on u.id = coalesce(sa.user_id, sa.pr_id)
     where l.component = 'deduction'
  `);
  const allDeductions = await db.execute(sql`
    select count(*)::int as n, coalesce(sum(amount), 0)::float8 as total
      from main.payment_voucher_line where component = 'deduction'
  `);
  const all = allDeductions.rows[0] as unknown as { n: number; total: number };

  console.log('\n=== [2] deduction lines must never reach an outlet figure ===');
  console.log(`  deduction lines in the DB: ${all.n}, totalling RM ${all.total.toFixed(2)}`);

  if (deductions.rows.length === 0) {
    console.log(
      '  ⚠️ NOT EXERCISED — no deduction line is receipt-backed, so none can be\n' +
        '     reached through the (shift, PR) join the report uses. The allow-list is\n' +
        '     still the guard; this check has nothing to catch today.',
    );
  } else {
    const repo = new ShiftAssignmentRepositoryClass();
    let leaked = 0;
    for (const row of deductions.rows as unknown as {
      outlet: string;
      shift_date: string;
      pr: string;
      amount: number;
    }[]) {
      const found = await db.execute(sql`select id from main.outlet where name = ${row.outlet}`);
      const outletId = (found.rows[0] as unknown as { id: string }).id;
      const reported = await repo.reportCostByPrDay({
        outletIds: [outletId],
        fromDate: row.shift_date,
        toDate: row.shift_date,
      });
      const commission = reported.reduce((s, x) => s + x.commission, 0);
      const hit = reported.some(
        (x) => Math.abs(x.commission - Math.abs(row.amount)) < 0.005,
      );
      console.log(
        `  ${row.outlet} ${row.shift_date} ${row.pr}: deduction RM ${row.amount.toFixed(2)} · ` +
          `commission reported RM ${commission.toFixed(2)}${hit ? '  *** LEAK ***' : ''}`,
      );
      if (hit) leaked += 1;
    }
    console.log(
      leaked === 0
        ? '  ✅ no deduction reached the outlet-facing figure'
        : `  *** ${leaked} DEDUCTION(S) LEAKED TO AN OUTLET ***`,
    );
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
