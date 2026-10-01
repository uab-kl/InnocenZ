import { describe, expect, it } from 'vitest';
import {
  issueStamps,
  issuedNotice,
  paidNotice,
  voucherPayeeUserId,
  voucherStatusNotice,
} from './payment-voucher-issue.js';

const voucher = {
  id: '11111111-2222-4333-8444-555555555555',
  voucherNo: 'PV-000009',
  weekStart: '2026-09-13',
  weekEnd: '2026-09-19',
  net: '1250.00',
};

describe('issueStamps — the dates a voucher takes on leaving review', () => {
  it('stamps today and the week-anchored due date on a voucher that has neither', () => {
    expect(
      issueStamps({ issuedDate: null, dueDate: null, weekEnd: '2026-09-19' }, '2026-09-21'),
    ).toEqual({ issuedDate: '2026-09-21', dueDate: '2026-09-26' });
  });

  it('never re-dates an issued voucher or moves a due date already written', () => {
    expect(
      issueStamps(
        { issuedDate: '2026-09-14', dueDate: '2026-09-26', weekEnd: '2026-09-19' },
        '2026-09-28',
      ),
    ).toEqual({});
  });

  it('fills only the half that is missing', () => {
    expect(
      issueStamps({ issuedDate: '2026-09-14', dueDate: null, weekEnd: '2026-09-19' }, '2026-09-28'),
    ).toEqual({ dueDate: '2026-09-26' });
    expect(
      issueStamps({ issuedDate: null, dueDate: '2026-09-26', weekEnd: '2026-09-19' }, '2026-09-28'),
    ).toEqual({ issuedDate: '2026-09-28' });
  });

  it('anchors the due date to the week, not to the day it was sent', () => {
    const early = issueStamps({ issuedDate: null, dueDate: null, weekEnd: '2026-09-19' }, '2026-09-20');
    const late = issueStamps({ issuedDate: null, dueDate: null, weekEnd: '2026-09-19' }, '2026-10-02');
    expect(early.dueDate).toBe(late.dueDate);
  });

  it('writes no due date for a weekless or malformed voucher rather than guessing one', () => {
    expect(issueStamps({ issuedDate: null, dueDate: null, weekEnd: null }, '2026-09-21')).toEqual({
      issuedDate: '2026-09-21',
    });
    expect(
      issueStamps({ issuedDate: null, dueDate: null, weekEnd: '2026-02-30' }, '2026-09-21'),
    ).toEqual({ issuedDate: '2026-09-21' });
  });
});

describe('voucherStatusNotice — which transition tells the PR', () => {
  it('Send to PR raises "issued" with the week the app words it from', () => {
    const notice = voucherStatusNotice('pending_review', 'sent', voucher);
    expect(notice?.kind).toBe('payment_voucher_issued');
    expect(notice?.payload).toMatchObject({
      voucherId: voucher.id,
      voucherNo: 'PV-000009',
      weekStart: '2026-09-13',
      weekEnd: '2026-09-19',
    });
  });

  it('a voucher handed back after a dispute is announced again', () => {
    expect(voucherStatusNotice('disputed', 'sent', voucher)?.kind).toBe('payment_voucher_issued');
  });

  it('Mark as paid raises "paid" with the amount', () => {
    const notice = voucherStatusNotice('signed', 'paid', voucher);
    expect(notice?.kind).toBe('payment_voucher_paid');
    expect(notice?.body).toContain('RM 1250.00');
    expect(notice?.payload).toMatchObject({ voucherId: voucher.id, amount: '1250.00' });
  });

  it('rings for transitions only — a bank reference added later is silent', () => {
    expect(voucherStatusNotice('paid', 'paid', voucher)).toBeNull();
    expect(voucherStatusNotice('pending_review', undefined, voucher)).toBeNull();
  });

  it('rings again for "Resend to PR" (sent → sent), flagged as a reminder', () => {
    // Owner, 29 Sep 2026: a resend should notify. A double-click is absorbed by
    // the notification layer's two-minute repeat guard, not here.
    const notice = voucherStatusNotice('sent', 'sent', voucher);
    expect(notice?.kind).toBe('payment_voucher_issued');
    expect(notice?.title).toBe('Reminder: your payment voucher is waiting');
    expect(notice?.payload).toMatchObject({ voucherId: voucher.id, resent: true });
    // The first send is not a reminder.
    expect(voucherStatusNotice('pending_review', 'sent', voucher)?.payload).not.toHaveProperty('resent');
  });

  it('says nothing for the moves that are not the PR’s news', () => {
    // The override re-opens a voucher for correction; the send that follows it
    // is what tells the PR.
    expect(voucherStatusNotice('signed', 'pending_review', voucher)).toBeNull();
    expect(voucherStatusNotice('sent', 'disputed', voucher)).toBeNull();
  });
});

describe('notice wording', () => {
  it('the issued notice matches the Sunday job’s copy', () => {
    expect(issuedNotice(voucher)).toMatchObject({
      title: 'Your payment voucher is ready',
      body: 'Week 2026-09-13 to 2026-09-19. Check the amounts and raise a dispute if anything is wrong.',
    });
  });

  it('a weekless voucher is still announced, without an invented week', () => {
    expect(issuedNotice({ ...voucher, weekStart: null, weekEnd: null }).body).not.toContain('null');
  });

  it('the paid notice falls back when a voucher has no number', () => {
    expect(paidNotice({ ...voucher, voucherNo: null }).body).toBe(
      'Your voucher — RM 1250.00 has been transferred to your bank.',
    );
  });
});

describe('voucherPayeeUserId', () => {
  it('prefers the user key and falls back to the legacy pr key', () => {
    expect(voucherPayeeUserId({ userId: 'u1', prId: 'p1' })).toBe('u1');
    expect(voucherPayeeUserId({ userId: null, prId: 'p1' })).toBe('p1');
    expect(voucherPayeeUserId({ userId: null, prId: null })).toBeNull();
  });
});
