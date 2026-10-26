/**
 * ONE-TIME BACKFILL — link every voucher LINE to its venue by id
 * (`payment_voucher_line.outlet_id`), so screens can print the venue's CURRENT
 * name instead of the name copied in when the line was written (22 Oct 2026).
 *
 * The symptom: 60 lines still read "Emhub Testing" for the venue now named
 * "UAB Emhub". `payment_voucher_line.outlet` is free text, so a rename never
 * reaches it. The FK column it needs ALREADY EXISTS — migration 0083 added it
 * (FK → main.outlet ON DELETE SET NULL, indexed) and backfilled it once by exact
 * name — but nothing has written it since, and the model never declared it, so
 * every line written after 4 Aug 2026 is NULL. No new migration is needed.
 *
 * Each line's venue is DERIVED from its own records, strongest first:
 *   1. receipt   — receipt_id → receipt.shift_assignment_id → shift.outlet_id
 *   2. assignment — the assignment uuid packed in `ref` (wages `wages|checkin|…|<id>|`,
 *                   generator wages `<id>`, overtime `<id>-ot`) → shift.outlet_id
 * Both are TENANT-SCOPED, like the live writer (`resolveLineOutletIds`): only a
 * receipt on the line's OWN voucher, and only an assignment of the voucher's
 * agency, may name a venue. There is NO name fallback any more — matching the
 * stored text against every agency's outlets was a cross-tenant guess, and the
 * dry run showed the two id paths cover every line it links (see the rules file).
 * A line whose receipt and ref name DIFFERENT venues is reported and left alone:
 * guessing would attach money to the wrong venue.
 *
 * The text column is NOT touched. It stays the as-issued snapshot the printed
 * and signed voucher carries; only the NULL `outlet_id` is filled.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_backfill-voucher-line-outlet.ts          # dry run (READ ONLY)
 *   npx tsx --tsconfig tsconfig.json src/scripts/_backfill-voucher-line-outlet.ts --apply  # write
 *   … --simulate-missing-column   # dry run as if 0083 never ran (proves the guard)
 *
 * Dry run runs inside `SET TRANSACTION READ ONLY` and rolls back. --apply is one
 * transaction, fills only `outlet_id IS NULL`, stamps `updated_at`/`updated_by`,
 * and never overwrites a value already set — a second run changes nothing. If
 * the rows it writes differ in number from the plan it printed, it throws and
 * the whole write rolls back.
 * If the column is missing (a database 0083 never reached) the dry run says so
 * and still reports what it WOULD link; --apply then refuses.
 *
 * Prints counts, venue names (organisations, not people) and short ids only.
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import type { DbTransaction } from '@/types/db-transaction';
import {
  assertWrittenMatchesPlan,
  planLine,
  type DerivedLine,
  type Plan,
} from './_backfill-voucher-line-outlet-rules';

const APPLY = process.argv.includes('--apply');
/**
 * Dry run only: behave as if 0083 had never run, to prove the pre-migration
 * path reports rather than crashes. Refused beside --apply.
 */
const SIMULATE_MISSING = process.argv.includes('--simulate-missing-column');
const ACTOR = 'backfill-voucher-line-outlet-2026-10-22';
/** How many unresolved / conflicting lines to list by name before summarising. */
const LIST_LIMIT = 40;

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

/** Thrown to roll the read-only dry run back once it has printed. */
class ReadOnlyDone extends Error {}

/**
 * Every line with the venue each path names. `current_id` is selected only
 * when the column exists — the query must run on a database 0083 never reached.
 */
function derivedLinesSql(hasColumn: boolean) {
  const currentId = hasColumn ? sql`pl.outlet_id` : sql`null::uuid`;
  return sql`
    select pl.id,
           v.voucher_no,
           pl.line_date::text as line_date,
           pl.component::text as component,
           pl.outlet as stored_text,
           ${currentId} as current_id,
           rs.outlet_id as via_receipt,
           (select s2.outlet_id
              from main.shift_assignment sa2
              join main.shift s2 on s2.id = sa2.shift_id
             where sa2.id::text = lower(substring(pl.ref from
                   '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'))
               and sa2.agency_id = v.agency_id
           ) as via_ref
      from main.payment_voucher_line pl
      join main.payment_voucher v on v.id = pl.voucher_id
      left join main.payment_voucher_receipt r
             on r.id = pl.receipt_id and r.voucher_id = pl.voucher_id
      left join main.shift_assignment sa
             on sa.id = r.shift_assignment_id and sa.agency_id = v.agency_id
      left join main.shift rs on rs.id = sa.shift_id`;
}

async function columnExists(tx: DbTransaction): Promise<boolean> {
  const [row] = toRows<{ n: number }>(
    await tx.execute(sql`
      select count(*)::int as n from information_schema.columns
       where table_schema = 'main' and table_name = 'payment_voucher_line'
         and column_name = 'outlet_id'`),
  );
  return (row?.n ?? 0) > 0;
}

const short = (id: string | null) => (id ? id.slice(0, 8) : '—');

async function outletNames(tx: DbTransaction): Promise<Map<string, string>> {
  const rows = toRows<{ id: string; name: string }>(
    await tx.execute(sql`select id, name from main.outlet`),
  );
  return new Map(rows.map((row) => [row.id, row.name]));
}

function report(
  lines: DerivedLine[],
  names: Map<string, string>,
  hasColumn: boolean,
) {
  const planned = lines.map((line) => ({ line, plan: planLine(line) }));
  const alreadySet = planned.filter(({ line }) => line.current_id !== null);
  const setDisagrees = alreadySet.filter(
    ({ line, plan }) =>
      plan.outletId !== null && plan.outletId !== line.current_id,
  );
  const toLink = planned.filter(
    ({ line, plan }) => line.current_id === null && plan.outletId !== null,
  );
  const byMethod = (m: Plan['method']) =>
    toLink.filter(({ plan }) => plan.method === m).length;
  const open = planned.filter(({ line }) => line.current_id === null);
  const conflicts = open.filter(({ plan }) => plan.method === 'conflict');
  const unresolved = open.filter(({ plan }) => plan.method === 'unresolved');

  console.log(`voucher lines scanned:                         ${lines.length}`);
  console.log(
    `  outlet_id already set:                       ${alreadySet.length}`,
  );
  console.log(
    `    of which disagree with the derived venue:  ${setDisagrees.length} (never overwritten)`,
  );
  console.log(`  outlet_id NULL:                              ${open.length}`);
  console.log(
    `${(hasColumn ? 'lines it will link:' : 'lines it WOULD link:').padEnd(47)}${toLink.length}`,
  );
  console.log(
    `  via receipt → shift:                         ${byMethod('receipt')}`,
  );
  console.log(
    `  via ref's assignment → shift:                ${byMethod('assignment')}`,
  );
  console.log(
    `left NULL — receipt and ref disagree:          ${conflicts.length}`,
  );
  console.log(
    `left NULL — unresolved:                        ${unresolved.length}`,
  );

  // What the screens will say instead, once they read through the id.
  const change = new Map<string, number>();
  for (const { line, plan } of toLink) {
    const key = `${line.stored_text ?? '(no text)'}  →  ${names.get(plan.outletId!) ?? '?'}`;
    change.set(key, (change.get(key) ?? 0) + 1);
  }
  if (change.size > 0) {
    console.log('\nstored text → current venue name, for the lines it links:');
    for (const [key, n] of [...change].sort((a, b) => b[1] - a[1]))
      console.log(`  ${n}× ${key}`);
  }

  const list = (title: string, rows: typeof planned) => {
    if (rows.length === 0) return;
    console.log(`\n${title}:`);
    for (const { line } of rows.slice(0, LIST_LIMIT)) {
      console.log(
        `  line ${short(line.id)}  ${line.voucher_no ?? '(unnumbered)'}  ${line.line_date ?? '—'}  ` +
          `${line.component ?? '(unclassified)'}  "${line.stored_text ?? ''}"  ` +
          `receipt→${short(line.via_receipt)} ref→${short(line.via_ref)} current=${short(line.current_id)}`,
      );
    }
    if (rows.length > LIST_LIMIT)
      console.log(`  … and ${rows.length - LIST_LIMIT} more`);
  };
  list(
    'unresolved lines (left NULL; screens keep the stored text)',
    unresolved,
  );
  list('conflicting lines (receipt and ref name different venues)', conflicts);
  list('already-set lines that disagree with the derived venue', setDisagrees);

  return toLink;
}

/**
 * Fill outlet_id where NULL, re-deriving inside the write so a line changed
 * since the read is judged as it stands. Same precedence as `planLine`.
 */
async function applyBackfill(tx: DbTransaction): Promise<number> {
  const result = await tx.execute(sql`
    with d as (${derivedLinesSql(true)})
    update main.payment_voucher_line l
       set outlet_id = coalesce(d.via_receipt, d.via_ref),
           updated_at = now(),
           updated_by = ${ACTOR}
      from d
     where l.id = d.id
       and l.outlet_id is null
       and coalesce(d.via_receipt, d.via_ref) is not null
       and not (d.via_receipt is not null and d.via_ref is not null and d.via_receipt <> d.via_ref)`);
  return Number((result as { rowCount?: number | null }).rowCount ?? 0);
}

async function main() {
  if (APPLY && SIMULATE_MISSING)
    throw new Error('--simulate-missing-column is for the dry run only');
  console.log(
    `mode: ${APPLY ? 'APPLY' : 'dry run, READ ONLY (pass --apply to write)'}`,
  );
  await db
    .transaction(async (tx) => {
      if (!APPLY) await tx.execute(sql`set transaction read only`);
      const hasColumn = SIMULATE_MISSING ? false : await columnExists(tx);
      if (!hasColumn) {
        console.log(
          'payment_voucher_line.outlet_id: column missing — run pnpm migrate:deploy first ' +
            '(migration 0083 adds it). Reporting what it WOULD link:',
        );
      }
      const lines = toRows<DerivedLine>(
        await tx.execute(derivedLinesSql(hasColumn)),
      );
      const names = await outletNames(tx);
      console.log('');
      const toLink = report(lines, names, hasColumn);

      if (!APPLY) throw new ReadOnlyDone();
      if (!hasColumn)
        throw new Error(
          'refusing --apply: payment_voucher_line.outlet_id does not exist',
        );
      const written = await applyBackfill(tx);
      // Throws on a mismatch, which rolls the whole transaction back.
      assertWrittenMatchesPlan(written, toLink.length);
      console.log(`\nrows written: ${written} (as planned)`);
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
