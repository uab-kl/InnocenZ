import { isCounterSigned } from './payment-voucher-lock';
import type { PaymentVoucherStatus } from './payment-voucher.model';

/**
 * IS THIS VOUCHER A SIGNED RECORD? — for the data scripts that would rewrite
 * one (`_check-voucher-pr-ic.ts`, `_fix-attendance-stamp.ts`).
 *
 * The status alone is not enough. The agency can sign a voucher that is still
 * `pending_review`, and a stamp can outlive a status that was moved back by
 * hand. Any one of these means someone put their name — or the money — to the
 * figures, so a script must refuse unless told otherwise.
 */

/**
 * A voucher's settlement facts as a data script reads them: the status as text
 * plus whether each stamp is present (`… is not null`), never the stamps.
 */
export type VoucherSettlementView = {
  status: string;
  financeHeadSigned: boolean;
  prSigned: boolean;
  paid: boolean;
};

/** Every mark that makes the voucher a signed record — empty for a draft. */
export function signedRecordMarks(voucher: VoucherSettlementView): string[] {
  const marks: string[] = [];
  if (isCounterSigned(voucher.status as PaymentVoucherStatus))
    marks.push(`status ${voucher.status.toUpperCase()}`);
  if (voucher.financeHeadSigned) marks.push('agency signature');
  if (voucher.prSigned) marks.push('PR signature');
  if (voucher.paid) marks.push('paid stamp');
  return marks;
}
