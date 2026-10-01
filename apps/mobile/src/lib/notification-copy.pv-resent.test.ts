import { translations } from '../i18n/translations';
import type { NotificationRecord } from './api';
import { localizeNotification } from './notification-copy';

/**
 * "Resend to PR" rings again (owner, 29 Sep 2026). The row is the same
 * `payment_voucher_issued` kind; `payload.resent` makes the phone word it as a
 * reminder rather than repeat "Your payment voucher is ready".
 */

function issuedRow(payload: Record<string, unknown>): NotificationRecord {
  return {
    id: 'n1',
    kind: 'payment_voucher_issued',
    title: 'Reminder: your payment voucher is waiting',
    body: 'Week 2026-09-06 to 2026-09-12. Check the amounts and raise a dispute if anything is wrong.',
    payload,
    readAt: null,
    createdAt: '2026-09-29T02:00:00.000Z',
  };
}

const week = { voucherId: 'v1', weekStart: '2026-09-06', weekEnd: '2026-09-12' };

describe('payment_voucher_issued — a resend reads as a reminder', () => {
  it('titles a resend as a reminder in every language, keeping the week body', () => {
    for (const locale of ['en', 'zh', 'zh-Hant'] as const) {
      const out = localizeNotification(issuedRow({ ...week, resent: true }), locale, translations[locale]);
      expect(out.title).toBe(translations[locale].notif.pvResentTitle);
      expect(out.body).toBeTruthy();
    }
  });

  it('keeps the "ready" title for the first send', () => {
    const out = localizeNotification(issuedRow(week), 'en', translations.en);
    expect(out.title).toBe(translations.en.notif.pvIssuedTitle);
  });
});
