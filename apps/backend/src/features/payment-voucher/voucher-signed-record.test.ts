import { describe, expect, it } from 'vitest';
import { signedRecordMarks } from './voucher-signed-record';

const draft = {
  status: 'pending_review',
  financeHeadSigned: false,
  prSigned: false,
  paid: false,
};

describe('signedRecordMarks', () => {
  it('is empty for an unsigned draft', () => {
    expect(signedRecordMarks(draft)).toEqual([]);
    expect(signedRecordMarks({ ...draft, status: 'sent' })).toEqual([]);
  });

  it('names a signed or paid status', () => {
    expect(signedRecordMarks({ ...draft, status: 'signed' })).toEqual([
      'status SIGNED',
    ]);
    expect(signedRecordMarks({ ...draft, status: 'paid' })).toEqual([
      'status PAID',
    ]);
  });

  it('names each stamp even when the status reads like a draft', () => {
    expect(signedRecordMarks({ ...draft, financeHeadSigned: true })).toEqual([
      'agency signature',
    ]);
    expect(signedRecordMarks({ ...draft, prSigned: true })).toEqual([
      'PR signature',
    ]);
    expect(signedRecordMarks({ ...draft, paid: true })).toEqual(['paid stamp']);
  });

  it('lists every mark a paid voucher carries', () => {
    expect(
      signedRecordMarks({
        status: 'paid',
        financeHeadSigned: true,
        prSigned: true,
        paid: true,
      }),
    ).toEqual([
      'status PAID',
      'agency signature',
      'PR signature',
      'paid stamp',
    ]);
  });
});
