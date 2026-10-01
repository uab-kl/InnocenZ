import { translations } from '../i18n/translations';
import type { NotificationRecord } from './api';
import { localizeNotification } from './notification-copy';

/**
 * "Mark as paid" now tells the PR (28 Sep 2026 audit: it never did). The row is
 * written in English; the phone rebuilds it in her language from the payload.
 */

function paidRow(payload: Record<string, unknown> | null): NotificationRecord {
  return {
    id: 'n1',
    kind: 'payment_voucher_paid',
    title: 'You have been paid',
    body: 'PV-000009 — RM 1250.00 has been transferred to your bank.',
    payload,
    readAt: null,
    createdAt: '2026-09-29T02:00:00.000Z',
  };
}

describe('payment_voucher_paid, in the reader’s language', () => {
  it('rebuilds title and body from the payload', () => {
    const out = localizeNotification(
      paidRow({ voucherId: 'v1', voucherNo: 'PV-000009', amount: '1250.00' }),
      'zh',
      translations.zh,
    );
    expect(out.title).toBe(translations.zh.notif.pvPaidTitle);
    expect(out.body).toContain('PV-000009');
    expect(out.body).toContain('1,250.00');
  });

  it('words it without a number when the payload carries none', () => {
    const out = localizeNotification(
      paidRow({ voucherId: 'v1', amount: '80.00' }),
      'en',
      translations.en,
    );
    expect(out.body).toBe('RM 80.00 has been transferred to your bank.');
  });

  it('keeps the stored body when the amount is missing, never a sentence with a hole', () => {
    const out = localizeNotification(paidRow({ voucherId: 'v1' }), 'zh', translations.zh);
    expect(out.title).toBe(translations.zh.notif.pvPaidTitle);
    expect(out.body).toBe('PV-000009 — RM 1250.00 has been transferred to your bank.');
  });
});
