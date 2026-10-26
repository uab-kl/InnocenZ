/**
 * ONE-ROW CORRECTION — an attendance stamp that cannot be true (22 Oct 2026).
 *
 * Velvet 23's 23 Jul 22:00–04:00 shift carries a check-in of 23 Jul 10:48 and a
 * check-out of 28 Jul 09:56 (MYT), so History shows a "119.13h shift". Pay on
 * that row is a fixed amount and was not inflated; the STAMPS are wrong, and
 * every screen that reads clocked time from them repeats the error.
 *
 * The live check-out cannot write such a stamp any more — `sealCheckOut` clamps
 * a late tap to the scheduled end — so this is history to correct, one row at a
 * time, by a person who has decided what the stamp should have been.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_fix-attendance-stamp.ts --list-long
 *   npx tsx --tsconfig tsconfig.json src/scripts/_fix-attendance-stamp.ts --assignment <id>                 # dry run
 *   npx tsx --tsconfig tsconfig.json src/scripts/_fix-attendance-stamp.ts --assignment <id> \
 *        [--checkout 2026-07-24T04:00:00+08:00] [--checkin 2026-07-23T21:55:00+08:00] [--force-settled] --apply
 *
 * - `--list-long` READS ONLY: every assignment whose clocked span exceeds 16 h.
 * - Default proposal: check-in unchanged, check-out = the shift's scheduled END
 *   (what the clamp would have written). A stamp outside the shift day ± 16 h, a
 *   non-forward span, or a result still over 16 h is REFUSED, never adjusted.
 * - A SETTLED row is refused too, unless `--force-settled`: one that was released
 *   (`released_by` set), or whose money sits on a voucher that is a signed record
 *   (SIGNED/PAID status, either signature, or a paid stamp — found by a line's
 *   ref or a receipt naming the assignment). Its stamps are part of that record.
 * - `pay_amount` is FIXED: never recomputed, never written — the new stamps do not
 *   change what the night paid. The dry run prints what the seal's rule WOULD give.
 * - `--apply` writes `check_in_at` / `check_out_at`, `worked_minutes` when the row
 *   carries one (re-derived through the seal's own `earnedWage`), and
 *   `updated_at` / `updated_by` — in one transaction that re-asserts the stamps
 *   it read, so a row that moved in between is left alone. It NEVER writes
 *   `pay_amount` or any overtime column: what the night paid, and any overtime
 *   decision on it, are money decisions this script only reports.
 *
 * The dry run and `--list-long` run in one `begin read only` transaction.
 * Prints ids, stamps, hours and amounts — never a PR's name, phone or IC.
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import type { DbTransaction } from '@/types/db-transaction';
import { shiftWindowInstants } from '@/util/slot-window';
import {
  clockedHours,
  derivedWorkedMinutes,
  MAX_PLAUSIBLE_SHIFT_HOURS,
  parseStampArgs,
  proposeStamps,
  settledRefusal,
  type CarryingVoucher,
} from './_fix-attendance-stamp-rules';
import { signedRecordMarks } from '@/features/payment-voucher/voucher-signed-record';

const ACTOR = 'fix-attendance-stamp-2026-10-22';
const KL_OFFSET_MS = 8 * 3_600_000;

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}
/** Drizzle's raw execute hands timestamps back as strings — fetch them as epoch ms. */
const epochMs = (column: string) =>
  sql.raw(`(extract(epoch from ${column}) * 1000)::float8`);
const asDate = (ms: number | string | null): Date | null =>
  ms == null ? null : new Date(Number(ms));
/** "2026-07-24 04:00 MYT" — the venue's clock, whatever the machine's is. */
function kl(at: Date | null): string {
  if (!at) return '—';
  return `${new Date(at.getTime() + KL_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')} MYT`;
}

type Row = {
  id: string;
  status: string;
  shift_date: string;
  slot: string | null;
  outlet: string | null;
  in_ms: number | null;
  /** The stamps as Postgres prints them — full microseconds, for the re-asserting WHERE. */
  in_text: string | null;
  out_text: string | null;
  out_ms: number | null;
  pay_amount: string;
  day_rate_amount: string | null;
  worked_minutes: number | null;
  scheduled_minutes: number | null;
  overtime_minutes: number | null;
  overtime_status: string | null;
  released: boolean;
};

const ROW_COLUMNS = sql`
  a.id, a.status::text as status, s.shift_date::text as shift_date, s.slot, o.name as outlet,
  ${epochMs('a.check_in_at')} as in_ms, ${epochMs('a.check_out_at')} as out_ms,
  a.check_in_at::text as in_text, a.check_out_at::text as out_text,
  a.pay_amount::text as pay_amount, a.day_rate_amount::text as day_rate_amount,
  a.worked_minutes, a.scheduled_minutes, a.overtime_minutes, a.overtime_status,
  a.released_by is not null as released`;

async function listLong(tx: DbTransaction) {
  const rows = toRows<Row & { hours: string }>(
    await tx.execute(sql`
      select ${ROW_COLUMNS},
             round((extract(epoch from (a.check_out_at - a.check_in_at)) / 3600.0)::numeric, 2)::text as hours
        from main.shift_assignment a
        join main.shift s on s.id = a.shift_id
        left join main.outlet o on o.id = s.outlet_id
       where a.check_in_at is not null and a.check_out_at is not null
         and a.check_out_at - a.check_in_at > make_interval(hours => ${MAX_PLAUSIBLE_SHIFT_HOURS})
       order by a.check_out_at - a.check_in_at desc`),
  );
  const [backwards] = toRows<{ n: number }>(
    await tx.execute(sql`
      select count(*)::int as n from main.shift_assignment
       where check_in_at is not null and check_out_at is not null and check_out_at <= check_in_at`),
  );
  console.log(
    `attendance rows clocked over ${MAX_PLAUSIBLE_SHIFT_HOURS} h: ${rows.length}`,
  );
  for (const r of rows) {
    console.log(
      `  ${r.id}  ${r.hours.padStart(7)} h  shift ${r.shift_date} ${r.slot ?? '(no slot)'} @ ${r.outlet ?? '(no outlet)'}` +
        `  in ${kl(asDate(r.in_ms))}  out ${kl(asDate(r.out_ms))}  status ${r.status}  pay RM${r.pay_amount}` +
        `  worked ${r.worked_minutes ?? '—'}/${r.scheduled_minutes ?? '—'} min` +
        `  OT ${r.overtime_minutes ?? '—'} min ${r.overtime_status ?? ''}${r.released ? '  (released)' : ''}`,
    );
  }
  console.log(
    `attendance rows whose check-out is not after their check-in: ${backwards?.n ?? 0}`,
  );
}

/**
 * Every voucher carrying this assignment's money: a line whose `ref` packs its
 * id (wages `wages|checkin|…|<id>|`, generator `<id>`, `<id>-ot`, `<id>-pen`)
 * or a receipt on it. Share-locked when writing, so a voucher cannot be signed
 * between this read and the stamp write.
 */
async function carryingVouchers(
  tx: DbTransaction,
  assignmentId: string,
  lock: boolean,
): Promise<CarryingVoucher[]> {
  const id = assignmentId.toLowerCase();
  const rows = toRows<{
    voucher_no: string | null;
    status: string;
    finance_head_signed: boolean;
    pr_signed: boolean;
    paid: boolean;
  }>(
    await tx.execute(sql`
      select v.voucher_no, v.status::text as status,
             v.finance_head_signed_at is not null as finance_head_signed,
             v.pr_signed_at is not null as pr_signed,
             v.paid_at is not null as paid
        from main.payment_voucher v
       where exists (select 1 from main.payment_voucher_line pl
                      where pl.voucher_id = v.id
                        and position(${id} in lower(coalesce(pl.ref, ''))) > 0)
          or exists (select 1 from main.payment_voucher_receipt r
                      where r.voucher_id = v.id and r.shift_assignment_id = ${id}::uuid)
       order by v.voucher_no nulls last
       ${lock ? sql`for share of v` : sql``}`),
  );
  return rows.map((r) => ({
    voucherNo: r.voucher_no,
    status: r.status,
    financeHeadSigned: r.finance_head_signed,
    prSigned: r.pr_signed,
    paid: r.paid,
  }));
}

async function main() {
  const args = parseStampArgs(process.argv.slice(2));
  const apply = args.mode === 'fix' && args.apply;

  await db.transaction(async (tx) => {
    if (!apply) {
      await tx.execute(sql`set transaction read only`);
      const [ro] = toRows<{ ro: string }>(
        await tx.execute(
          sql`select current_setting('transaction_read_only') as ro`,
        ),
      );
      if (ro?.ro !== 'on')
        throw new Error('dry run is not read-only — refusing to continue');
    }
    console.log(
      `mode: ${apply ? 'APPLY' : args.mode === 'list-long' ? 'list (read only)' : 'dry run (pass --apply to write)'}`,
    );

    if (args.mode === 'list-long') {
      await listLong(tx);
      return;
    }

    const [row] = toRows<Row>(
      await tx.execute(sql`
        select ${ROW_COLUMNS}
          from main.shift_assignment a
          join main.shift s on s.id = a.shift_id
          left join main.outlet o on o.id = s.outlet_id
         where a.id = ${args.assignmentId}
         ${apply ? sql`for update of a` : sql``}`),
    );
    if (!row) throw new Error(`no shift_assignment ${args.assignmentId}`);

    const current = {
      checkInAt: asDate(row.in_ms),
      checkOutAt: asDate(row.out_ms),
    };
    const scheduled = shiftWindowInstants(row.shift_date, row.slot);
    console.log(
      `assignment ${row.id} — shift ${row.shift_date} ${row.slot ?? '(no slot)'} @ ${row.outlet ?? '(no outlet)'}, status ${row.status}`,
    );
    console.log(
      `  scheduled:  ${scheduled ? `${kl(scheduled.start)} → ${kl(scheduled.end)}` : '(slot has no parseable window)'}`,
    );
    console.log(
      `  current:    in ${kl(current.checkInAt)}  out ${kl(current.checkOutAt)}  = ` +
        `${current.checkInAt && current.checkOutAt ? `${clockedHours(current.checkInAt, current.checkOutAt)} h` : '—'}`,
    );

    const vouchers = await carryingVouchers(tx, row.id, apply);
    console.log(
      `  released:   ${row.released ? 'YES (released_by is set)' : 'no'}`,
    );
    console.log(
      `  vouchers:   ${
        vouchers.length === 0
          ? '(none carry this assignment)'
          : vouchers
              .map((v) => {
                const marks = signedRecordMarks(v);
                return `${v.voucherNo ?? '(unnumbered)'} ${v.status.toUpperCase()}${marks.length > 0 ? ` [signed: ${marks.join(', ')}]` : ''}`;
              })
              .join(' · ')
      }`,
    );
    const settled = settledRefusal(
      { released: row.released, vouchers },
      args.forceSettled,
    );
    if (settled) {
      console.log(`  REFUSED:    ${settled}`);
      process.exitCode = 1;
      return;
    }
    if (
      args.forceSettled &&
      settledRefusal({ released: row.released, vouchers }, false)
    ) {
      console.log(
        '  --force-settled given: changing the stamps of a settled record',
      );
    }

    const proposal = proposeStamps({
      shiftDate: row.shift_date,
      scheduled,
      current,
      overrides: { checkIn: args.checkIn, checkOut: args.checkOut },
    });
    if (!proposal.ok) {
      console.log(`  REFUSED:    ${proposal.refusal}`);
      process.exitCode = 1;
      return;
    }
    const derived = derivedWorkedMinutes({
      storedWorkedMinutes: row.worked_minutes,
      dayRateAmount: row.day_rate_amount,
      scheduled,
      checkInAt: proposal.checkInAt,
      checkOutAt: proposal.checkOutAt,
    });
    console.log(
      `  proposed:   in ${kl(proposal.checkInAt)}  out ${kl(proposal.checkOutAt)}  = ${proposal.hours} h`,
    );
    console.log(
      `  worked_minutes: ${row.worked_minutes ?? '—'} → ${derived.workedMinutes ?? '(unchanged — row predates 0097)'}` +
        `  (scheduled ${row.scheduled_minutes ?? '—'})`,
    );
    console.log(
      `  pay_amount: RM${row.pay_amount} — FIXED: not recomputed and not written by this script`,
    );
    if (derived.wouldPay != null && derived.wouldPay !== row.pay_amount) {
      console.log(
        `  ⚠ the seal's wage rule would give RM${derived.wouldPay} for the new stamps — review by hand; not written`,
      );
    }
    if (row.overtime_minutes != null) {
      console.log(
        `  ⚠ overtime on file: ${row.overtime_minutes} min, status ${row.overtime_status ?? '—'} — a decision already on file; NOT changed here`,
      );
    }

    if (!apply) return;

    const result = await tx.execute(sql`
      update main.shift_assignment
         set check_in_at = ${proposal.checkInAt.toISOString()},
             check_out_at = ${proposal.checkOutAt.toISOString()},
             ${derived.workedMinutes != null ? sql`worked_minutes = ${derived.workedMinutes},` : sql``}
             updated_at = now(),
             updated_by = ${ACTOR}
       where id = ${row.id}
         and check_in_at is not distinct from ${row.in_text}::timestamptz
         and check_out_at is not distinct from ${row.out_text}::timestamptz`);
    const written = Number(
      (result as { rowCount?: number | null }).rowCount ?? 0,
    );
    if (written !== 1)
      throw new Error(
        `expected to write 1 row, wrote ${written} — rolled back`,
      );
    console.log('  rows written: 1');
  });
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e).slice(0, 500));
    process.exit(1);
  });
