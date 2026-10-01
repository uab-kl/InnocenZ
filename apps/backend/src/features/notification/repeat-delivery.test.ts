import { describe, expect, it } from 'vitest';
import { isRepeatDelivery, REPEAT_WINDOW_MS, sameJson, type NoticeContent } from './repeat-delivery';

/**
 * ONE EVENT DELIVERED TWICE IS NOT TWO NOTICES.
 *
 * The shapes below are the duplicates found on `innocenz-test` (29 Sep 2026,
 * read-only): 13 Sep's tier statements and day-review notices, written 0.4–0.8 s
 * apart by two backends running the same Sunday job, and one join approval
 * written twice 0.3 s apart. The genuine repeats beside them must still go out.
 */

const TIER: NoticeContent = {
  kind: 'subscription_tier_weekly',
  title: 'Your weekly plan: Growth',
  body: '12 PVs issued last week.',
  payload: { weekStart: '2026-09-06', weekEnd: '2026-09-12', pvCount: 12, planName: 'Growth', outcome: 'moved' },
};

describe('isRepeatDelivery', () => {
  it('the same statement twice is a repeat', () => {
    expect(isRepeatDelivery(TIER, { ...TIER, payload: { ...TIER.payload } })).toBe(true);
  });

  it('payload key ORDER does not matter — Postgres returns jsonb keys in its own order', () => {
    const stored = {
      ...TIER,
      payload: { outcome: 'moved', planName: 'Growth', pvCount: 12, weekEnd: '2026-09-12', weekStart: '2026-09-06' },
    };
    expect(isRepeatDelivery(stored, TIER)).toBe(true);
  });

  it('a different week, count or outcome is news', () => {
    expect(isRepeatDelivery(TIER, { ...TIER, payload: { ...TIER.payload, pvCount: 13 } })).toBe(false);
    expect(isRepeatDelivery(TIER, { ...TIER, payload: { ...TIER.payload, weekStart: '2026-09-13' } })).toBe(false);
  });

  it('two broadcasts from one agency differ by their words, not their payload', () => {
    const first: NoticeContent = { kind: 'agency_broadcast', title: 'Dress code', body: 'Black tonight', payload: { agencyId: 'a1' } };
    expect(isRepeatDelivery(first, { ...first, body: 'White tonight' })).toBe(false);
    expect(isRepeatDelivery(first, { ...first, title: 'Venue change' })).toBe(false);
  });

  it('once the first was READ, the same words again are a new call to act (re-sent after an Override)', () => {
    const issued: NoticeContent = {
      kind: 'payment_voucher_issued',
      title: 'Your payment voucher is ready',
      body: 'Week 2026-09-20 to 2026-09-26.',
      payload: { voucherId: 'pv-9', voucherNo: 'PV-000009', weekStart: '2026-09-20', weekEnd: '2026-09-26' },
    };
    expect(isRepeatDelivery({ ...issued, readAt: null }, issued)).toBe(true);
    expect(isRepeatDelivery({ ...issued, readAt: new Date('2026-09-29T02:00:00Z') }, issued)).toBe(false);
  });

  it('a different kind is never a repeat, even with the same words', () => {
    expect(isRepeatDelivery(TIER, { ...TIER, kind: 'subscription_invoice_opened' })).toBe(false);
  });

  it('a missing body and a null body are the same thing', () => {
    const a: NoticeContent = { kind: 'shift_assigned', title: 'New shift', payload: { assignmentId: 'x' } };
    expect(isRepeatDelivery({ ...a, body: null }, a)).toBe(true);
  });

  it('a missing payload and a null payload are the same thing', () => {
    const a: NoticeContent = { kind: 'agency_broadcast', title: 'Hi', body: 'x' };
    expect(isRepeatDelivery({ ...a, payload: null }, a)).toBe(true);
  });

  it('the window is shorter than the closest genuine repeat on file (10 min) and longer than any duplicate (< 1 s)', () => {
    expect(REPEAT_WINDOW_MS).toBeGreaterThan(1_000);
    expect(REPEAT_WINDOW_MS).toBeLessThan(10 * 60 * 1000);
  });
});

describe('sameJson', () => {
  it('nested objects and arrays compare by value', () => {
    expect(sameJson({ a: [1, { b: 2, c: 3 }] }, { a: [1, { c: 3, b: 2 }] })).toBe(true);
    expect(sameJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });

  it('an undefined field is the field JSON drops', () => {
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it('null is not an empty object', () => {
    expect(sameJson(null, {})).toBe(false);
  });
});
