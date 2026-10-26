import { describe, expect, it } from 'vitest';
import { shiftWindowInstants } from '@/util/slot-window';
import {
  clockedHours,
  derivedWorkedMinutes,
  parseStampArgs,
  proposeStamps,
  settledRefusal,
  shiftDayBounds,
  venueIso,
  type CarryingVoucher,
} from './_fix-attendance-stamp-rules';

const ID = 'f5a1f227-a1ca-449d-8d02-10bddc05a1c9';
const at = (iso: string) => new Date(iso);

// The row that prompted the script: Velvet 23, 23 Jul 22:00–04:00, stamped
// 23 Jul 10:48 → 28 Jul 09:56 MYT.
const velvet = {
  shiftDate: '2026-07-23',
  scheduled: shiftWindowInstants('2026-07-23', '22:00 - 04:00'),
  current: {
    checkInAt: at('2026-07-23T10:48:00+08:00'),
    checkOutAt: at('2026-07-28T09:56:00+08:00'),
  },
};

describe('parseStampArgs', () => {
  it('reads --list-long as a read-only listing', () => {
    expect(parseStampArgs(['--list-long'])).toEqual({ mode: 'list-long' });
  });

  it('refuses --list-long combined with --apply', () => {
    expect(() => parseStampArgs(['--list-long', '--apply'])).toThrow(
      /only reads/,
    );
  });

  it('reads the assignment, both overrides and --apply', () => {
    const args = parseStampArgs([
      '--assignment',
      ID,
      '--checkin',
      '2026-07-23T22:00:00+08:00',
      '--checkout',
      '2026-07-24T04:00:00+08:00',
      '--apply',
    ]);
    expect(args).toEqual({
      mode: 'fix',
      assignmentId: ID,
      checkIn: at('2026-07-23T14:00:00Z'),
      checkOut: at('2026-07-23T20:00:00Z'),
      apply: true,
      forceSettled: false,
    });
  });

  it('reads --force-settled', () => {
    expect(
      parseStampArgs(['--assignment', ID, '--force-settled', '--apply']),
    ).toMatchObject({ forceSettled: true, apply: true });
  });

  it('is a dry run unless --apply is passed', () => {
    expect(parseStampArgs(['--assignment', ID])).toMatchObject({
      apply: false,
      checkIn: null,
      checkOut: null,
      forceSettled: false,
    });
  });

  it('refuses a missing or malformed assignment id', () => {
    expect(() => parseStampArgs([])).toThrow(/--assignment/);
    expect(() => parseStampArgs(['--assignment', 'abc'])).toThrow(/not a uuid/);
    expect(() => parseStampArgs(['--assignment', '--apply'])).toThrow(
      /needs a value/,
    );
  });

  it('refuses a stamp with no offset — it would be read on the machine clock', () => {
    expect(() =>
      parseStampArgs(['--assignment', ID, '--checkout', '2026-07-24T04:00']),
    ).toThrow(/offset/);
  });
});

describe('shiftDayBounds', () => {
  it('spans 16 h before the venue midnight opening the day to 16 h after the one closing it', () => {
    const { from, to } = shiftDayBounds('2026-07-23');
    expect(venueIso(from)).toBe('2026-07-22T08:00:00+08:00');
    expect(venueIso(to)).toBe('2026-07-24T16:00:00+08:00');
  });
});

describe('proposeStamps', () => {
  it('defaults the check-out to the scheduled end, and refuses when the check-in keeps it over 16 h', () => {
    const result = proposeStamps({
      ...velvet,
      overrides: { checkIn: null, checkOut: null },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toContain('17.2 h');
      expect(result.refusal).toContain('2026-07-23T22:00:00+08:00');
    }
  });

  it('accepts the default check-out once the check-in is corrected — a 6 h night', () => {
    const result = proposeStamps({
      ...velvet,
      overrides: { checkIn: at('2026-07-23T22:00:00+08:00'), checkOut: null },
    });
    expect(result).toEqual({
      ok: true,
      checkInAt: at('2026-07-23T22:00:00+08:00'),
      checkOutAt: at('2026-07-24T04:00:00+08:00'),
      hours: 6,
    });
  });

  it('refuses a check-out outside the shift day ± 16 h — the 28 Jul stamp itself', () => {
    const result = proposeStamps({
      ...velvet,
      overrides: {
        checkIn: at('2026-07-23T22:00:00+08:00'),
        checkOut: at('2026-07-28T09:56:00+08:00'),
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.refusal).toMatch(/check-out .* outside the shift day/);
  });

  it('refuses a check-in outside the shift day ± 16 h', () => {
    const result = proposeStamps({
      ...velvet,
      overrides: { checkIn: at('2026-07-22T07:59:00+08:00'), checkOut: null },
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.refusal).toMatch(/check-in .* outside the shift day/);
  });

  it('refuses a span that is not forward', () => {
    const result = proposeStamps({
      ...velvet,
      overrides: {
        checkIn: at('2026-07-24T04:00:00+08:00'),
        checkOut: at('2026-07-24T03:00:00+08:00'),
      },
    });
    expect(result).toEqual({
      ok: false,
      refusal: 'check-out must be after check-in',
    });
  });

  it('needs --checkout when the slot has no window to default from', () => {
    const result = proposeStamps({
      ...velvet,
      scheduled: null,
      overrides: { checkIn: null, checkOut: null },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toMatch(/pass --checkout/);
  });

  it('needs --checkin when the row has no check-in at all', () => {
    const result = proposeStamps({
      ...velvet,
      current: { checkInAt: null, checkOutAt: null },
      overrides: { checkIn: null, checkOut: null },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toMatch(/pass --checkin/);
  });

  it('is a no-op on a row already carrying the proposed stamps — a second --apply changes nothing', () => {
    const fixed = {
      checkInAt: at('2026-07-23T22:00:00+08:00'),
      checkOutAt: at('2026-07-24T04:00:00+08:00'),
    };
    const result = proposeStamps({
      ...velvet,
      current: fixed,
      overrides: { checkIn: null, checkOut: null },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toMatch(/nothing to change/);
  });
});

describe('clockedHours', () => {
  it('is what History showed for the row — 119.13 h', () => {
    expect(
      clockedHours(velvet.current.checkInAt, velvet.current.checkOutAt),
    ).toBe(119.13);
  });
});

describe('derivedWorkedMinutes', () => {
  const stamps = {
    checkInAt: at('2026-07-23T22:30:00+08:00'),
    checkOutAt: at('2026-07-24T04:00:00+08:00'),
  };

  it('leaves a pre-0097 row alone — no worked minutes, no day rate, nothing to invent', () => {
    expect(
      derivedWorkedMinutes({
        storedWorkedMinutes: null,
        dayRateAmount: null,
        scheduled: velvet.scheduled,
        ...stamps,
      }),
    ).toEqual({ workedMinutes: null, wouldPay: null });
  });

  it('re-derives worked minutes through the seal rule, and only REPORTS what it would pay', () => {
    expect(
      derivedWorkedMinutes({
        storedWorkedMinutes: 360,
        dayRateAmount: '700.00',
        scheduled: velvet.scheduled,
        ...stamps,
      }),
    ).toEqual({ workedMinutes: 330, wouldPay: '641.67' });
  });
});

describe('settledRefusal', () => {
  const draft: CarryingVoucher = {
    voucherNo: 'PV-000011',
    status: 'pending_review',
    financeHeadSigned: false,
    prSigned: false,
    paid: false,
  };
  const paidVoucher: CarryingVoucher = {
    voucherNo: 'PV-000002',
    status: 'paid',
    financeHeadSigned: true,
    prSigned: true,
    paid: true,
  };

  it('lets an unreleased row on no voucher, or only on drafts, through', () => {
    expect(settledRefusal({ released: false, vouchers: [] }, false)).toBeNull();
    expect(
      settledRefusal({ released: false, vouchers: [draft] }, false),
    ).toBeNull();
  });

  it('refuses a released assignment', () => {
    expect(settledRefusal({ released: true, vouchers: [] }, false)).toMatch(
      /released.*--force-settled/,
    );
  });

  it('refuses a row whose money is on a signed or paid voucher, naming it', () => {
    const reason = settledRefusal(
      { released: false, vouchers: [draft, paidVoucher] },
      false,
    );
    expect(reason).toMatch(/PV-000002/);
    expect(reason).toMatch(/status PAID/);
    expect(reason).not.toMatch(/PV-000011/);
  });

  it('counts a signature on a voucher still in review as settled', () => {
    expect(
      settledRefusal(
        { released: false, vouchers: [{ ...draft, financeHeadSigned: true }] },
        false,
      ),
    ).toMatch(/agency signature/);
  });

  it('--force-settled overrides it', () => {
    expect(
      settledRefusal({ released: true, vouchers: [paidVoucher] }, true),
    ).toBeNull();
  });

  it('leaves the out-of-window refusal standing — the two are separate checks', () => {
    // Forcing the settled check does nothing for a stamp five days out.
    expect(
      settledRefusal({ released: false, vouchers: [paidVoucher] }, true),
    ).toBeNull();
    const result = proposeStamps({
      ...velvet,
      overrides: {
        checkIn: at('2026-07-23T22:00:00+08:00'),
        checkOut: at('2026-07-28T09:56:00+08:00'),
      },
    });
    expect(result.ok).toBe(false);
  });
});
