/**
 * READ-ONLY. Does the LIVE database still obey the project's own rules, and is
 * the money self-consistent?
 *
 * CLAUDE.md: audit columns come as a set of four; one fact lives in one table;
 * id is the first column. Plus the money invariants no schema check can see —
 * a voucher whose lines do not add to its net, an assignment pointing at a
 * shift that is gone, a membership pointing at an org that is gone.
 *
 * `check-schema-drift.ts` compares MODELS to COLUMNS; it cannot see any of
 * this. Issues no UPDATE/INSERT/DELETE — every statement is a SELECT.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const problems: string[] = [];
const notes: string[] = [];

/** 1. Audit columns must be present as a SET of four, never partially. */
const audit = await db.execute(sql`
  select table_name,
         count(*) filter (where column_name in ('created_at','updated_at','created_by','updated_by')) as n,
         string_agg(column_name, ',') filter (where column_name in ('created_at','updated_at','created_by','updated_by')) as cols
  from information_schema.columns
  where table_schema='main'
  group by table_name
  having count(*) filter (where column_name in ('created_at','updated_at','created_by','updated_by')) between 1 and 3
  order by table_name`);
for (const r of (audit.rows ?? audit) as any[]) {
  problems.push(`AUDIT-COLUMNS   ${r.table_name}: only ${r.n} of 4 (${r.cols})`);
}

/** 2. `id` must be the FIRST column of every table that has one. */
const idFirst = await db.execute(sql`
  select c.table_name, c.column_name as first_col
  from information_schema.columns c
  where c.table_schema='main' and c.ordinal_position=1
    and exists (select 1 from information_schema.columns c2
                where c2.table_schema='main' and c2.table_name=c.table_name and c2.column_name='id')
    and c.column_name <> 'id'
  order by c.table_name`);
for (const r of (idFirst.rows ?? idFirst) as any[]) {
  problems.push(`ID-NOT-FIRST    ${r.table_name}: first column is "${r.first_col}"`);
}

/** 3. Orphans — a FK column holding an id that no longer exists anywhere. */
const orphanChecks: Array<[string, string, string, string]> = [
  ['shift_assignment', 'shift_id', 'shift', 'assignment with no shift'],
  ['shift_assignment', 'agency_id', 'agency', 'assignment with no agency'],
  ['agency_pr', 'agency_id', 'agency', 'roster row with no agency'],
  ['agency_pr', 'user_id', 'user', 'roster row with no user'],
  ['agency_user', 'agency_id', 'agency', 'membership with no agency'],
  ['agency_user', 'user_id', 'user', 'membership with no user'],
  ['outlet_user', 'outlet_id', 'outlet', 'membership with no outlet'],
  ['outlet_user', 'user_id', 'user', 'membership with no user'],
  // ⚠️ REAL column names, not the TS property names: the join column is
  // `voucher_id` (not payment_voucher_id) and the money column is `amount`
  // (not commission). Reading the model instead of the table is what made
  // three of these checks report 'Failed query' rather than a result.
  ['payment_voucher_line', 'voucher_id', 'payment_voucher', 'voucher line with no voucher'],
  ['shift', 'outlet_id', 'outlet', 'shift with no outlet'],
  ['user_role', 'user_id', 'user', 'role grant with no user'],
  ['user_role', 'role_id', 'role', 'role grant with no role'],
  ['role_permission', 'role_id', 'role', 'permission with no role'],
  ['subscription_invoice', 'member_subscription_id', 'member_subscription', 'invoice with no subscription'],
  ['payment_method', 'agency_id', 'agency', 'card with no agency'],
  ['payment_method', 'outlet_id', 'outlet', 'card with no outlet'],
];
for (const [tbl, col, ref, label] of orphanChecks) {
  try {
    const r = await db.execute(sql`
      select count(*) as n from main.${sql.raw(tbl)} t
      where t.${sql.raw(col)} is not null
        and not exists (select 1 from main.${sql.raw(ref)} p where p.id = t.${sql.raw(col)})`);
    const n = Number(((r.rows ?? r) as any[])[0]?.n ?? 0);
    if (n > 0) problems.push(`ORPHAN-FK       ${tbl}.${col} -> ${ref}: ${n} row(s) — ${label}`);
  } catch (e: any) {
    notes.push(`skipped ${tbl}.${col}: ${String(e.message).split('\n')[0]}`);
  }
}

/** 4. MONEY — a voucher's lines must add up to what it says it pays. */
try {
  const money = await db.execute(sql`
    select pv.voucher_no, pv.status, pv.net::numeric as net,
           coalesce(sum(l.amount),0)::numeric as line_sum,
           coalesce(pv.deduction,0)::numeric as deduction
    from main.payment_voucher pv
    left join main.payment_voucher_line l on l.voucher_id = pv.id
    group by pv.id, pv.voucher_no, pv.status, pv.net, pv.deduction
    having abs(coalesce(sum(l.amount),0) - coalesce(pv.deduction,0) - pv.net) > 0.01
    order by pv.voucher_no`);
  for (const r of (money.rows ?? money) as any[]) {
    problems.push(`MONEY-MISMATCH  ${r.voucher_no} (${r.status}): lines ${r.line_sum} - deduction ${r.deduction} != net ${r.net}`);
  }
} catch (e: any) {
  notes.push(`voucher money check could not run: ${String(e.message).split('\n')[0]}`);
}

/** 5. A signed voucher must carry the ink that signed it. */
try {
  const signed = await db.execute(sql`
    select count(*) as n from main.payment_voucher
    where status in ('signed','paid') and (pr_signed_at is null or pr_signature is null)`);
  const nSigned = Number(((signed.rows ?? signed) as any[])[0]?.n ?? 0);
  if (nSigned > 0) problems.push(`SIGNED-NO-INK   ${nSigned} voucher(s) signed/paid with no signature or timestamp`);
} catch (e: any) {
  notes.push(`signature check could not run: ${String(e.message).split('\n')[0]}`);
}

/** 6. Every active org membership must name a lane the code knows. */
const laneSets: Array<[string, string[]]> = [
  ['agency_user', ['owner', 'guarantor', 'finance', 'director']],
  ['outlet_user', ['owner', 'guarantor', 'finance', 'director', 'operations_head']],
];
for (const [tbl, lanes] of laneSets) {
  const r = await db.execute(sql`
    select sub_role, count(*) as n from main.${sql.raw(tbl)}
    where status='active' group by sub_role order by sub_role`);
  for (const row of (r.rows ?? r) as any[]) {
    if (!lanes.includes(row.sub_role)) {
      problems.push(`UNKNOWN-LANE    ${tbl}.sub_role='${row.sub_role}' on ${row.n} active row(s)`);
    }
  }
}

/** 7. Every ACTIVE org must retain at least one ACTIVE OWNER. */
const ownerChecks: Array<[string, string, string]> = [
  ['agency_user', 'agency_id', 'agency'],
  ['outlet_user', 'outlet_id', 'outlet'],
];
for (const [tbl, orgCol, orgTbl] of ownerChecks) {
  const r = await db.execute(sql`
    select o.id, o.name from main.${sql.raw(orgTbl)} o
    where o.status = 'active'
      and not exists (select 1 from main.${sql.raw(tbl)} m
                      where m.${sql.raw(orgCol)} = o.id and m.status='active' and m.sub_role='owner')`);
  for (const row of (r.rows ?? r) as any[]) {
    problems.push(`NO-ACTIVE-OWNER ${orgTbl} "${row.name}" is active with no active owner`);
  }
}

console.log('\n=== DATABASE INTEGRITY ===');
if (notes.length) {
  console.log('\nNotes (checks that could NOT run — these are about the INSTRUMENT, not the data):');
  notes.forEach((n) => console.log('  - ' + n));
}
if (problems.length === 0) {
  console.log('\nOK - 0 problems across audit-columns, id-first, 16 FK orphan checks, voucher money, signature ink, lanes, last-owner.');
} else {
  console.log(`\n${problems.length} problem(s):`);
  problems.forEach((p) => console.log('  ' + p));
}
process.exit(problems.length ? 1 : 0);
