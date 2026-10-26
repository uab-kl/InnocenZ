/**
 * VOUCHERS WHOSE PRINTED IC NO LONGER MATCHES THE PR'S PROFILE (22 Oct 2026).
 *
 * `payment_voucher.pr_ic` is copied from the profile when a voucher opens. When
 * the profile is corrected afterwards the two disagree, and the voucher keeps
 * naming the old number — PV-000009 printed "950312-14-8821" while the PR's
 * profile reads "960312-14-8820". Which one is right is a person's call, so the
 * dry run only LISTS; the fix is one voucher at a time, by name.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_check-voucher-pr-ic.ts
 *       dry run (READ ONLY): every voucher whose pr_ic differs from the profile
 *   npx tsx --tsconfig tsconfig.json src/scripts/_check-voucher-pr-ic.ts --voucher PV-000009 --use profile
 *       dry run of the fix for one voucher: what it WOULD write, or why it would refuse
 *   … --voucher PV-000009 --use profile --apply [--agency <id or 8-char prefix>] [--force-signed]
 *       copy the profile IC onto that one voucher
 *
 * Refusals, each printed with its reason:
 *  - `voucher_no` is per AGENCY (0152), so one number can name several
 *    documents: if it does, --agency must say whose.
 *  - a SIGNED RECORD is a document someone put their name to; changing its IC
 *    rewrites it, so it needs --force-signed as well. Signed = a SIGNED or PAID
 *    status, OR the agency's signature, the PR's signature or a paid stamp —
 *    the agency can sign a voucher that is still pending_review.
 *  - no profile IC to copy, or the two already match → nothing to do.
 * One transaction, re-checked under a row lock; stamps updated_at/updated_by;
 * a second run changes nothing (the IC then matches).
 *
 * ⚠️ Prints ICs MASKED only — the last two characters (••••••••••21). Never the full number.
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import type { DbTransaction } from '@/types/db-transaction';
import {
  maskIc,
  prIcMatchesProfile,
} from '@/features/payment-voucher/pr-ic-match';
import {
  icFixRefusal,
  signedMarksOf,
  type VoucherIcRow,
} from './_check-voucher-pr-ic-rules';

const ACTOR = 'check-voucher-pr-ic-2026-10-22';

type Args = {
  apply: boolean;
  voucherNo: string | null;
  use: string | null;
  agency: string | null;
  forceSigned: boolean;
};

function argValue(flag: string): string | null {
  const at = process.argv.indexOf(flag);
  if (at < 0) return null;
  const value = process.argv[at + 1];
  return value && !value.startsWith('--') ? value : null;
}

function parseArgs(): Args {
  return {
    apply: process.argv.includes('--apply'),
    voucherNo: argValue('--voucher'),
    use: argValue('--use'),
    agency: argValue('--agency'),
    forceSigned: process.argv.includes('--force-signed'),
  };
}

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

class ReadOnlyDone extends Error {}

/** Every voucher beside its payee's current profile IC (payee = user_id, else the legacy pr_id). */
async function readVouchers(
  tx: DbTransaction,
  lockId?: string,
): Promise<VoucherIcRow[]> {
  const where = lockId ? sql`where v.id = ${lockId}` : sql``;
  const lock = lockId ? sql`for update of v` : sql``;
  return toRows<VoucherIcRow>(
    await tx.execute(sql`
      select v.id, v.voucher_no, v.status::text as status, v.agency_id, a.name as agency_name,
             v.week_start::text as week_start, v.pr_ic, up.id_no as profile_ic,
             v.finance_head_signed_at is not null as finance_head_signed,
             v.pr_signed_at is not null as pr_signed,
             v.paid_at is not null as paid
        from main.payment_voucher v
        left join main.agency a on a.id = v.agency_id
        left join main.user_profile up on up.user_id = coalesce(v.user_id, v.pr_id)
        ${where}
       order by v.voucher_no nulls last, v.week_start
        ${lock}`),
  );
}

const describe = (row: VoucherIcRow) =>
  `${row.voucher_no ?? '(unnumbered)'}  ${row.status.toUpperCase().padEnd(14)} ` +
  `agency ${row.agency_name ?? '?'} (${row.agency_id.slice(0, 8)})  week ${row.week_start ?? '—'}  ` +
  `voucher ${maskIc(row.pr_ic)}  vs profile ${maskIc(row.profile_ic)}` +
  (signedMarksOf(row).length > 0
    ? `  [signed: ${signedMarksOf(row).join(', ')}]`
    : '');

function reportAll(rows: VoucherIcRow[]) {
  const judged = rows.map((row) => ({
    row,
    match: prIcMatchesProfile(row.pr_ic, row.profile_ic),
  }));
  const mismatched = judged.filter((j) => j.match === false);
  const formatOnly = judged.filter(
    (j) => j.match === true && j.row.pr_ic !== j.row.profile_ic,
  );
  console.log(`vouchers scanned:                          ${rows.length}`);
  console.log(
    `  IC matches the profile:                  ${judged.filter((j) => j.match === true).length}`,
  );
  console.log(
    `    of which differ only in formatting:    ${formatOnly.length} (not flagged)`,
  );
  console.log(
    `  cannot compare (no voucher or profile IC): ${judged.filter((j) => j.match === null).length}`,
  );
  console.log(
    `  IC DIFFERS from the profile:             ${mismatched.length}`,
  );
  for (const { row } of mismatched) console.log(`    ${describe(row)}`);
}

/** The single voucher --voucher names, or the reason it cannot be chosen. */
function pickTarget(rows: VoucherIcRow[], args: Args): VoucherIcRow | string {
  const wanted = args.voucherNo!.trim().toUpperCase();
  let candidates = rows.filter(
    (row) => (row.voucher_no ?? '').toUpperCase() === wanted,
  );
  if (args.agency) {
    const prefix = args.agency.toLowerCase();
    candidates = candidates.filter((row) =>
      row.agency_id.toLowerCase().startsWith(prefix),
    );
  }
  if (candidates.length === 0)
    return `no voucher numbered ${wanted}${args.agency ? ` for agency ${args.agency}` : ''}`;
  if (candidates.length > 1) {
    return (
      `${wanted} names ${candidates.length} vouchers (numbers are per agency) — pass --agency <id>:\n` +
      candidates.map((row) => `    ${describe(row)}`).join('\n')
    );
  }
  return candidates[0];
}

async function fixOne(tx: DbTransaction, rows: VoucherIcRow[], args: Args) {
  if (args.use !== 'profile')
    throw new Error('--use profile is required (the only supported source)');
  const picked = pickTarget(rows, args);
  if (typeof picked === 'string') throw new Error(picked);
  // Re-read under a row lock when writing: the status gate must judge the row
  // as it stands at the write, not as it stood at the scan.
  const [row] = args.apply ? await readVouchers(tx, picked.id) : [picked];
  if (!row) throw new Error(`voucher ${picked.id.slice(0, 8)} vanished`);

  console.log(`\ntarget: ${describe(row)}`);
  const reason = icFixRefusal(row, args.forceSigned);
  if (reason) {
    console.log(`REFUSED: ${reason}`);
    return;
  }
  console.log(
    `${args.apply ? 'setting' : 'would set'} pr_ic ${maskIc(row.pr_ic)} → ${maskIc(row.profile_ic)} (the profile's value, as stored)`,
  );
  const marks = signedMarksOf(row);
  if (marks.length > 0)
    console.log(
      `  --force-signed given: changing a signed record (${marks.join(', ')})`,
    );
  if (!args.apply) {
    console.log(
      '  dry run — add --apply to write. Note: bumps updated_at, so an editor open on it gets a 409 and must reload.',
    );
    return;
  }
  const result = await tx.execute(sql`
    update main.payment_voucher
       set pr_ic = ${row.profile_ic},
           updated_at = now(),
           updated_by = ${ACTOR}
     where id = ${row.id}
       and pr_ic is distinct from ${row.profile_ic}`);
  console.log(
    `rows written: ${Number((result as { rowCount?: number | null }).rowCount ?? 0)}`,
  );
}

async function main() {
  const args = parseArgs();
  if (args.apply && !args.voucherNo)
    throw new Error('--apply needs --voucher <PV-number> --use profile');
  console.log(`mode: ${args.apply ? 'APPLY' : 'dry run, READ ONLY'}`);
  await db
    .transaction(async (tx) => {
      if (!args.apply) await tx.execute(sql`set transaction read only`);
      const rows = await readVouchers(tx);
      reportAll(rows);
      if (args.voucherNo) await fixOne(tx, rows, args);
      if (!args.apply) throw new ReadOnlyDone();
    })
    .catch((e) => {
      if (!(e instanceof ReadOnlyDone)) throw e;
    });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e).slice(0, 1200));
    process.exit(1);
  });
