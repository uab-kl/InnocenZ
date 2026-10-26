/**
 * READ ONLY. How do voucher rows name their venue, and can each line's venue be
 * DERIVED from its own records rather than read from the stored text?
 *
 * `payment_voucher.outlet` and `payment_voucher_line.outlet` are free text with
 * no link, so a venue renamed after issue ("Emhub Testing" → "UAB Emhub") keeps
 * its old name on every voucher. Migration 0083 already added
 * `payment_voucher_line.outlet_id` (FK + index) but nothing writes it; this
 * asks the rows how much of it is filled and what could fill the rest:
 *  - how many vouchers / lines, how many distinct outlet texts;
 *  - per line, whether the venue comes from receipt → assignment → shift, from
 *    the wage ref's assignment id → shift, or only from the name;
 *  - whether one voucher ever spans more than one venue (decides whether the
 *    HEADER gets a column of its own or reads its lines').
 *
 * Every statement runs inside `SET TRANSACTION READ ONLY` and is rolled back.
 * Prints counts, venue names (organisation names, not personal data) and short
 * ids only.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-voucher-outlet-text.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

class ReadOnlyDone extends Error {}

async function main() {
  await db
    .transaction(async (tx) => {
      await tx.execute(sql`set transaction read only`);
      const q = async <T>(query: ReturnType<typeof sql>) =>
        toRows<T>(await tx.execute(query));

      console.log('vouchers / lines:');
      console.table(
        await q(sql`
          select (select count(*)::int from main.payment_voucher) as vouchers,
                 (select count(*)::int from main.payment_voucher_line) as lines,
                 (select count(distinct outlet)::int from main.payment_voucher) as distinct_header_texts,
                 (select count(distinct outlet)::int from main.payment_voucher_line) as distinct_line_texts,
                 (select count(*)::int from main.payment_voucher where outlet is null) as header_null,
                 (select count(*)::int from main.payment_voucher_line where outlet is null) as line_null`),
      );

      console.log(
        '\ndistinct outlet texts and whether an outlet of that exact name exists now:',
      );
      console.table(
        await q(sql`
          with t as (
            select outlet, 'header' as src from main.payment_voucher
            union all
            select outlet, 'line' from main.payment_voucher_line
          )
          select t.outlet,
                 count(*) filter (where src = 'header')::int as headers,
                 count(*) filter (where src = 'line')::int as lines,
                 (select count(*)::int from main.outlet o where o.name = t.outlet) as exact_name_matches
            from t group by t.outlet order by 3 desc`),
      );

      console.log('\nper line: which path names its venue');
      console.table(
        await q(sql`
          with l as (
            select pl.id, pl.voucher_id, pl.outlet, pl.receipt_id, pl.ref, pl.component::text as component,
                   rs.outlet_id as via_receipt,
                   (select s2.outlet_id
                      from main.shift_assignment sa2
                      join main.shift s2 on s2.id = sa2.shift_id
                     where sa2.id::text = lower(substring(pl.ref from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'))
                   ) as via_ref
              from main.payment_voucher_line pl
              left join main.payment_voucher_receipt r on r.id = pl.receipt_id
              left join main.shift_assignment sa on sa.id = r.shift_assignment_id
              left join main.shift rs on rs.id = sa.shift_id
          )
          select count(*)::int as lines,
                 count(*) filter (where receipt_id is not null)::int as has_receipt,
                 count(*) filter (where via_receipt is not null)::int as receipt_to_outlet,
                 count(*) filter (where via_ref is not null)::int as ref_to_outlet,
                 count(*) filter (where via_receipt is null and via_ref is not null)::int as ref_only,
                 count(*) filter (where via_receipt is not null and via_ref is not null and via_receipt <> via_ref)::int as receipt_ref_disagree,
                 count(*) filter (where via_receipt is null and via_ref is null)::int as neither
            from l`),
      );

      console.log('\nlines with neither path, by component and text:');
      console.table(
        await q(sql`
          select pl.component::text as component, pl.outlet, count(*)::int as n,
                 count(*) filter (where pl.ref is null)::int as ref_null
            from main.payment_voucher_line pl
            left join main.payment_voucher_receipt r on r.id = pl.receipt_id
            left join main.shift_assignment sa on sa.id = r.shift_assignment_id
           where sa.id is null
             and not exists (
               select 1 from main.shift_assignment sa2
                where sa2.id::text = lower(substring(pl.ref from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')))
           group by 1, 2 order by 3 desc`),
      );

      console.log(
        '\nvouchers whose lines name more than one venue (derived ids / texts):',
      );
      console.table(
        await q(sql`
          with l as (
            select pl.voucher_id, pl.outlet,
                   coalesce(rs.outlet_id,
                     (select s2.outlet_id from main.shift_assignment sa2 join main.shift s2 on s2.id = sa2.shift_id
                       where sa2.id::text = lower(substring(pl.ref from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')))
                   ) as oid
              from main.payment_voucher_line pl
              left join main.payment_voucher_receipt r on r.id = pl.receipt_id
              left join main.shift_assignment sa on sa.id = r.shift_assignment_id
              left join main.shift rs on rs.id = sa.shift_id
          )
          select count(*)::int as vouchers_with_lines,
                 count(*) filter (where n_ids > 1)::int as span_multiple_ids,
                 count(*) filter (where n_texts > 1)::int as span_multiple_texts
            from (select voucher_id, count(distinct oid) as n_ids, count(distinct outlet) as n_texts
                    from l group by voucher_id) v`),
      );

      console.log('\nderived venue vs stored line text (where derived):');
      console.table(
        await q(sql`
          with l as (
            select pl.outlet,
                   coalesce(rs.outlet_id,
                     (select s2.outlet_id from main.shift_assignment sa2 join main.shift s2 on s2.id = sa2.shift_id
                       where sa2.id::text = lower(substring(pl.ref from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')))
                   ) as oid
              from main.payment_voucher_line pl
              left join main.payment_voucher_receipt r on r.id = pl.receipt_id
              left join main.shift_assignment sa on sa.id = r.shift_assignment_id
              left join main.shift rs on rs.id = sa.shift_id
          )
          select l.outlet as stored_text, o.name as current_name, left(o.id::text, 8) as outlet_id8,
                 count(*)::int as lines
            from l join main.outlet o on o.id = l.oid
           group by 1, 2, 3 order by 4 desc`),
      );

      console.log('\noutlet* columns on the two voucher tables:');
      console.table(
        await q(sql`
          select table_name, column_name, data_type from information_schema.columns
           where table_schema = 'main' and table_name in ('payment_voucher', 'payment_voucher_line')
             and column_name like 'outlet%'`),
      );

      // 0083 added payment_voucher_line.outlet_id; the model never declared it.
      console.log(
        '\nconstraints / indexes on payment_voucher_line.outlet_id (0083):',
      );
      console.table(
        await q(sql`
          select conname as name, pg_get_constraintdef(oid) as def from pg_constraint
           where conname = 'payment_voucher_line_outlet_id_fk'
          union all
          select indexname, indexdef from pg_indexes
           where schemaname = 'main' and indexname = 'payment_voucher_line_outlet_id_idx'`),
      );

      console.log('\nlive outlet_id coverage vs the derived venue:');
      console.table(
        await q(sql`
          with l as (
            select pl.outlet_id,
                   coalesce(rs.outlet_id,
                     (select s2.outlet_id from main.shift_assignment sa2 join main.shift s2 on s2.id = sa2.shift_id
                       where sa2.id::text = lower(substring(pl.ref from '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')))
                   ) as oid
              from main.payment_voucher_line pl
              left join main.payment_voucher_receipt r on r.id = pl.receipt_id
              left join main.shift_assignment sa on sa.id = r.shift_assignment_id
              left join main.shift rs on rs.id = sa.shift_id
          )
          select count(*)::int as lines,
                 count(outlet_id)::int as outlet_id_set,
                 count(*) filter (where outlet_id is null)::int as outlet_id_null,
                 count(*) filter (where outlet_id is not null and oid is not null and outlet_id <> oid)::int as set_but_disagrees,
                 count(*) filter (where outlet_id is not null and oid = outlet_id)::int as set_and_agrees
            from l`),
      );
      throw new ReadOnlyDone();
    })
    .catch((e) => {
      if (!(e instanceof ReadOnlyDone)) throw e;
    });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e).slice(0, 800));
    process.exit(1);
  });
