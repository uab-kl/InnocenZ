/**
 * The pure half of `_check-voucher-pr-ic.ts` — the refusal — kept apart so it
 * is tested by calling it with rows, never by running the script against the
 * shared database. See the script's header for why it exists (PV-000009).
 */
import {
  normalizeIc,
  prIcMatchesProfile,
} from '@/features/payment-voucher/pr-ic-match';
import { signedRecordMarks } from '@/features/payment-voucher/voucher-signed-record';

/** One voucher beside its payee's profile IC, as the script reads it. */
export type VoucherIcRow = {
  id: string;
  voucher_no: string | null;
  status: string;
  agency_id: string;
  agency_name: string | null;
  week_start: string | null;
  pr_ic: string | null;
  profile_ic: string | null;
  /** `finance_head_signed_at is not null` — the stamp itself is never read. */
  finance_head_signed: boolean;
  /** `pr_signed_at is not null`. */
  pr_signed: boolean;
  /** `paid_at is not null`. */
  paid: boolean;
};

/** The marks that make this voucher a signed record (empty for a draft). */
export function signedMarksOf(row: VoucherIcRow): string[] {
  return signedRecordMarks({
    status: row.status,
    financeHeadSigned: row.finance_head_signed,
    prSigned: row.pr_signed,
    paid: row.paid,
  });
}

/**
 * Why this voucher's IC may not be changed, or null when it may.
 *
 * A signed record needs `--force-signed`, and "signed" is ANY of: a SIGNED or
 * PAID status, the agency's signature, the PR's signature, or a paid stamp.
 * Judging the status alone let a voucher the agency had already signed — still
 * `pending_review` — be rewritten without the flag.
 */
export function icFixRefusal(
  row: VoucherIcRow,
  forceSigned: boolean,
): string | null {
  if (normalizeIc(row.profile_ic) === null)
    return 'the PR has no IC on their profile to copy';
  if (prIcMatchesProfile(row.pr_ic, row.profile_ic) === true)
    return 'the voucher IC already matches the profile — nothing to do';
  const marks = signedMarksOf(row);
  if (marks.length > 0 && !forceSigned) {
    return (
      `${row.voucher_no ?? 'this voucher'} is a signed record (${marks.join(', ')}): the IC on it is what ` +
      'was signed, and changing it rewrites that record. Re-run with --force-signed to do it anyway.'
    );
  }
  return null;
}
