import { describe, expect, it } from 'vitest';
import {
  OVERRIDE_CLEARS,
  financeSignRefusal,
  isOverride,
  voucherDeleteRefusal,
  voucherUpdateRefusal,
} from './payment-voucher-lock.js';

const SIGNED_AT = new Date('2026-09-20T10:00:00Z');
const signed = { status: 'signed' as const, financeHeadSignedAt: SIGNED_AT };
const paid = { status: 'paid' as const, financeHeadSignedAt: SIGNED_AT };
const review = { status: 'pending_review' as const, financeHeadSignedAt: null };

describe('voucherUpdateRefusal — a counter-signed voucher is locked', () => {
  it('refuses a line rewrite on a signed voucher', () => {
    expect(voucherUpdateRefusal(signed, { fields: ['lines'] })).toMatch(/locked/);
  });

  it('refuses every header money field on a signed voucher', () => {
    for (const field of ['deduction', 'net', 'subtotal', 'weekStart', 'prName', 'financeHeadName']) {
      expect(voucherUpdateRefusal(signed, { fields: [field] })).toMatch(/locked/);
    }
  });

  it('refuses a rewrite on a paid voucher too', () => {
    expect(voucherUpdateRefusal(paid, { fields: ['lines', 'deduction'] })).toMatch(/locked/);
  });

  it('still lets a bank reference be attached to a paid voucher', () => {
    expect(voucherUpdateRefusal(paid, { fields: ['bankRef'] })).toBeNull();
    // The idempotent retry of the pay call, with the reference, also passes.
    expect(voucherUpdateRefusal(paid, { fields: ['status', 'bankRef'], status: 'paid' })).toBeNull();
  });

  it('refuses moving a paid voucher to any other state except the override', () => {
    for (const to of ['sent', 'signed', 'disputed'] as const) {
      expect(voucherUpdateRefusal(paid, { fields: ['status'], status: to })).toMatch(/settled/);
    }
  });

  it('refuses sending or disputing a signed voucher through PUT', () => {
    for (const to of ['sent', 'disputed'] as const) {
      expect(voucherUpdateRefusal(signed, { fields: ['status'], status: to })).toMatch(/only be recorded as paid/);
    }
  });

  it('leaves an unsigned voucher editable', () => {
    expect(voucherUpdateRefusal(review, { fields: ['lines', 'deduction'] })).toBeNull();
    expect(
      voucherUpdateRefusal({ status: 'disputed', financeHeadSignedAt: SIGNED_AT }, { fields: ['lines'] }),
    ).toBeNull();
  });
});

describe('voucherUpdateRefusal — the override is the only way back', () => {
  it('re-opens a signed or paid voucher with a reason', () => {
    for (const existing of [signed, paid]) {
      expect(
        voucherUpdateRefusal(existing, {
          fields: ['status', 'disputeNote'],
          status: 'pending_review',
          disputeNote: 'Wrong outlet on Tuesday',
        }),
      ).toBeNull();
    }
  });

  it('refuses an override without a reason', () => {
    expect(
      voucherUpdateRefusal(signed, { fields: ['status'], status: 'pending_review', disputeNote: '   ' }),
    ).toMatch(/Say why/);
  });

  it('refuses re-opening and rewriting in one call', () => {
    expect(
      voucherUpdateRefusal(signed, {
        fields: ['status', 'disputeNote', 'lines'],
        status: 'pending_review',
        disputeNote: 'fix',
      }),
    ).toMatch(/two steps/);
  });

  it('is recognised only from a counter-signed state', () => {
    expect(isOverride('signed', 'pending_review')).toBe(true);
    expect(isOverride('paid', 'pending_review')).toBe(true);
    expect(isOverride('sent', 'pending_review')).toBe(false);
    expect(isOverride('signed', 'paid')).toBe(false);
  });

  it('takes both signatures off but keeps the record of a transfer', () => {
    expect(OVERRIDE_CLEARS).toMatchObject({ prSignedAt: null, financeHeadSignedAt: null });
    expect(OVERRIDE_CLEARS).not.toHaveProperty('paidAt');
    expect(OVERRIDE_CLEARS).not.toHaveProperty('bankRef');
  });
});

describe('voucherUpdateRefusal — paid needs both signatures', () => {
  it('refuses recording payment when the agency never signed (PV-000006)', () => {
    expect(
      voucherUpdateRefusal({ status: 'signed', financeHeadSignedAt: null }, { fields: ['status'], status: 'paid' }),
    ).toMatch(/agency has not signed/);
  });

  it('records payment on a dual-signed voucher', () => {
    expect(voucherUpdateRefusal(signed, { fields: ['status', 'bankRef'], status: 'paid' })).toBeNull();
  });

  it('does not re-judge a voucher that is already paid', () => {
    expect(
      voucherUpdateRefusal({ status: 'paid', financeHeadSignedAt: null }, { fields: ['status'], status: 'paid' }),
    ).toBeNull();
  });
});

describe('voucherDeleteRefusal', () => {
  it('refuses deleting a signed or paid voucher', () => {
    expect(voucherDeleteRefusal(signed)).toMatch(/cannot be deleted/);
    expect(voucherDeleteRefusal(paid)).toMatch(/has paid/);
  });

  it('allows deleting a voucher nobody has counter-signed', () => {
    for (const status of ['pending_review', 'sent', 'disputed'] as const) {
      expect(voucherDeleteRefusal({ status, financeHeadSignedAt: null })).toBeNull();
    }
  });
});

describe('financeSignRefusal', () => {
  it('signs a voucher still in review, even over an earlier signature', () => {
    expect(financeSignRefusal(review)).toBeNull();
    expect(financeSignRefusal({ status: 'pending_review', financeHeadSignedAt: SIGNED_AT })).toBeNull();
  });

  it('lets the agency add a MISSING signature to a sent or signed voucher', () => {
    for (const status of ['sent', 'signed', 'disputed'] as const) {
      expect(financeSignRefusal({ status, financeHeadSignedAt: null })).toBeNull();
    }
  });

  it('never replaces a signature once the voucher has left review', () => {
    for (const status of ['sent', 'signed', 'disputed'] as const) {
      expect(financeSignRefusal({ status, financeHeadSignedAt: SIGNED_AT })).toMatch(/already been sent/);
    }
  });

  it('refuses signing after the money has moved', () => {
    expect(financeSignRefusal({ status: 'paid', financeHeadSignedAt: null })).toMatch(/already paid/);
  });
});
