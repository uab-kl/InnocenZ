import type { PrHistoryVoucher } from './api';
import { historyVoucherToPayWeek, weekMatchesStatusChip } from './payment-history-map';

/**
 * History → Payment, the two contradictions the 28 Sep audit found on the PR's
 * own list: a voucher still on the agency's desk printed "Issued 13 Sep" above
 * "Waiting for your agency to issue", and the "To sign" chip listed vouchers
 * the PR could not sign.
 */

function voucher(over: Partial<PrHistoryVoucher>): PrHistoryVoucher {
  return {
    voucherId: 'v1',
    voucherNo: 'PV-000009',
    agencyName: 'Atlas Agency',
    weekStart: '2026-09-13',
    weekEnd: '2026-09-19',
    net: '500.00',
    deduction: '0.00',
    wages: '500.00',
    status: 'sent',
    outlet: 'Velvet 23',
    bankRef: null,
    issuedDate: '2026-09-13',
    prSignedAt: null,
    paidAt: null,
    lines: [],
    ...over,
  };
}

describe('historyVoucherToPayWeek — issued means issued', () => {
  it('prints no issued date on a voucher the agency has not issued', () => {
    const week = historyVoucherToPayWeek(voucher({ status: 'pending_review' }));
    expect(week.issued).toBe('—');
    expect(week.awaitingIssue).toBe(true);
    expect(week.statusMeta).toBe('Waiting for your agency to issue');
  });

  it('keeps the issued date once the voucher has gone out', () => {
    const week = historyVoucherToPayWeek(voucher({ status: 'sent' }));
    expect(week.issued).toBe('13 Sep 2026');
    expect(week.awaitingIssue).toBe(false);
  });
});

describe('weekMatchesStatusChip — "To sign" lists only what she can sign', () => {
  const sent = historyVoucherToPayWeek(voucher({ status: 'sent' }));
  const inReview = historyVoucherToPayWeek(voucher({ status: 'pending_review' }));
  const disputed = historyVoucherToPayWeek(voucher({ status: 'disputed' }));
  const signed = historyVoucherToPayWeek(
    voucher({ status: 'signed', prSignedAt: '2026-09-21T03:00:00.000Z' }),
  );
  const paid = historyVoucherToPayWeek(voucher({ status: 'paid', paidAt: '2026-09-25T03:00:00.000Z' }));

  it('offers a SENT voucher', () => {
    expect(weekMatchesStatusChip(sent, 'pending')).toBe(true);
  });

  it('leaves out a voucher still in review and a disputed one — both wait on the agency', () => {
    expect(weekMatchesStatusChip(inReview, 'pending')).toBe(false);
    expect(weekMatchesStatusChip(disputed, 'pending')).toBe(false);
  });

  it('keeps the other chips as they were', () => {
    expect(weekMatchesStatusChip(signed, 'signed')).toBe(true);
    expect(weekMatchesStatusChip(paid, 'paid')).toBe(true);
    expect(weekMatchesStatusChip(paid, 'signed')).toBe(false);
    for (const w of [sent, inReview, disputed, signed, paid]) {
      expect(weekMatchesStatusChip(w, 'all')).toBe(true);
    }
  });
});
