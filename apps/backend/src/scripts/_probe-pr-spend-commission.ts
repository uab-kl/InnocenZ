/**
 * READ-ONLY. Does the report's cost side carry commission and approved OT?
 *
 * Calls the REAL `reportCostByPrDay` the /shift-sale/report endpoint uses, so
 * this proves the shipped query rather than a re-typed copy, and checks the two
 * ways this query could silently go wrong:
 *
 *  1. FAN-OUT — the commission subquery must not multiply the wage sum. Checked
 *     against a control query that performs no join at all.
 *  2. UNAPPROVED OVERTIME — a pending or rejected claim must contribute
 *     nothing, even though a rejected row still carries a frozen amount.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-pr-spend-commission.ts [outletName]
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import { ShiftAssignmentRepositoryClass } from '../features/shift-assignment/shift-assignment.repository';

const OUTLET = process.argv[2] ?? 'Emhub Testing';

async function main() {
  const found = await db.execute(sql`
    select id, name from main.outlet where name = ${OUTLET} limit 1
  `);
  const outlet = found.rows[0] as unknown as { id: string; name: string } | undefined;
  if (!outlet) throw new Error(`No outlet named ${OUTLET}`);

  const repo = new ShiftAssignmentRepositoryClass();
  const rows = await repo.reportCostByPrDay({ outletIds: [outlet.id] });

  console.log(`\n=== reportCostByPrDay — ${outlet.name} ===`);
  console.table(
    rows
      .filter((r) => r.commission !== 0 || r.overtime !== 0)
      .map((r) => ({
        day: r.soldOn,
        pr: r.prName,
        wage: r.cost,
        commission: r.commission,
        overtime: r.overtime,
        pr_spend: Math.round((r.cost + r.commission + r.overtime) * 100) / 100,
      })),
  );
  console.log('(rows with neither commission nor OT omitted)');

  const wages = rows.reduce((s, r) => s + r.cost, 0);
  const comm = rows.reduce((s, r) => s + r.commission, 0);
  const ot = rows.reduce((s, r) => s + r.overtime, 0);
  console.log(
    `\nTotals — wages RM ${wages.toFixed(2)} · commission RM ${comm.toFixed(2)} · ` +
      `OT RM ${ot.toFixed(2)} · PR spend RM ${(wages + comm + ot).toFixed(2)}`,
  );

  // 1. The wage half must be BIT-IDENTICAL to a query with no join at all —
  //    a fan-out shows up here as an inflated wage, not as an error.
  const control = await db.execute(sql`
    select coalesce(sum(sa.pay_amount), 0)::float8 as wages
      from main.shift_assignment sa
      join main.shift s on s.id = sa.shift_id
     where s.outlet_id = ${outlet.id}
       and sa.status not in ('cancelled', 'no_show')
  `);
  const expectedWages = Number((control.rows[0] as unknown as { wages: number }).wages);
  console.log(
    `\n[1] Wage control (no join): RM ${expectedWages.toFixed(2)} — ${
      Math.abs(expectedWages - wages) < 0.005 ? 'MATCHES (no fan-out)' : '*** DIFFERS — FAN-OUT ***'
    }`,
  );

  // 2. Only APPROVED overtime may be counted. This asserts against something
  //    that really exists — the venue has both a rejected and a pending claim —
  //    so a gate that silently did nothing would fail here rather than pass.
  const otRows = await db.execute(sql`
    select sa.overtime_status,
           count(*)::int as rows,
           coalesce(sum(sa.overtime_amount), 0)::float8 as frozen
      from main.shift_assignment sa
      join main.shift s on s.id = sa.shift_id
     where s.outlet_id = ${outlet.id}
       and sa.overtime_status is not null
     group by 1
  `);
  const byStatus = otRows.rows as unknown as {
    overtime_status: string;
    rows: number;
    frozen: number;
  }[];
  console.table(byStatus);
  const approved = byStatus.find((r) => r.overtime_status === 'approved')?.frozen ?? 0;
  const unapproved = byStatus.filter((r) => r.overtime_status !== 'approved');
  console.log(
    `[2] OT counted RM ${ot.toFixed(2)} vs approved-only RM ${Number(approved).toFixed(2)} — ${
      Math.abs(Number(approved) - ot) < 0.005 ? 'MATCHES' : '*** UNAPPROVED OT LEAKED ***'
    }`,
  );
  console.log(
    unapproved.length > 0
      ? `    (gate is exercised: ${unapproved
          .map((r) => `${r.rows} ${r.overtime_status}`)
          .join(', ')} present and excluded)`
      : '    ⚠️ NO unapproved claims at this venue — the gate was NOT exercised here.',
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
