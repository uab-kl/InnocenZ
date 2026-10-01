import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ notifyMany: vi.fn(async () => 1) }));

vi.mock('@/features/notification/notify.js', () => ({ notifyMany: hoisted.notifyMany }));
vi.mock('@/features/agency/agency-member.repository.js', () => ({
  AgencyMemberRepositoryClass: class {
    async listByAgency() {
      return [{ userId: 'user-owner', status: 'active', subRole: 'owner' }];
    }
  },
}));
vi.mock('@/features/outlet/outlet-member.repository.js', () => ({
  OutletMemberRepositoryClass: class {
    async listByOutlet() {
      return [];
    }
  },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { announceOpenedInvoices } from './announce-opened';
import type { OpenedInvoice } from './subscription-invoice.repository';

/**
 * Owner, 29 Sep 2026: a first partial week is not billed in full. The owner who
 * is told "New bill: RM 35.71" for a RM 125 week has to be told why.
 */
const AGENCY = '6e2cf753-0000-4000-8000-000000000000';

function opened(overrides: Partial<OpenedInvoice> = {}): OpenedInvoice {
  return {
    subscriberType: 'agency',
    subscriberId: AGENCY,
    subscriberName: 'Test Agency',
    periodStart: '2026-08-09',
    periodEnd: '2026-08-15',
    amount: '125.00',
    currency: 'MYR',
    proRata: null,
    creditApplied: null,
    ...overrides,
  };
}

beforeEach(() => hoisted.notifyMany.mockClear());

describe('announceOpenedInvoices', () => {
  it('says a pro-rated first week is pro-rated, and against what', async () => {
    await announceOpenedInvoices([
      opened({
        periodStart: '2026-08-02',
        periodEnd: '2026-08-08',
        amount: '35.71',
        proRata: { billedDays: 2, periodDays: 7, billedFrom: '2026-08-07', fullAmount: '125.00' },
      }),
    ]);

    expect(hoisted.notifyMany).toHaveBeenCalledWith(
      ['user-owner'],
      expect.objectContaining({
        title: 'New bill: RM 35.71',
        body:
          '2026-08-02 to 2026-08-08. Pro-rated: 2 of 7 days from 2026-08-07 (full period RM 125.00). ' +
          'Open Subscription to see everything still unpaid.',
      }),
    );
  });

  it('words a whole period exactly as it always has', async () => {
    await announceOpenedInvoices([opened()]);

    expect(hoisted.notifyMany).toHaveBeenCalledWith(
      ['user-owner'],
      expect.objectContaining({
        title: 'New bill: RM 125.00',
        body: '2026-08-09 to 2026-08-15. Open Subscription to see everything still unpaid.',
        payload: {
          periodStart: '2026-08-09',
          periodEnd: '2026-08-15',
          amount: '125.00',
          currency: 'MYR',
          count: 1,
        },
      }),
    );
  });

  /**
   * 29 Sep 2026 follow-up: 'the "New bill" notice shows the amount BEFORE
   * credits'. The figure a notice quotes is what the org will be asked to pay.
   */
  it('states what is OWED after a credit — and keeps the pro-rata sentence', async () => {
    await announceOpenedInvoices([
      opened({
        periodStart: '2026-08-02',
        periodEnd: '2026-08-08',
        amount: '25.71',
        creditApplied: '10.00',
        proRata: { billedDays: 2, periodDays: 7, billedFrom: '2026-08-07', fullAmount: '125.00' },
      }),
    ]);

    expect(hoisted.notifyMany).toHaveBeenCalledWith(
      ['user-owner'],
      expect.objectContaining({
        title: 'New bill: RM 25.71',
        body:
          '2026-08-02 to 2026-08-08. Pro-rated: 2 of 7 days from 2026-08-07 (full period RM 125.00). ' +
          'RM 10.00 credit from a switch to a cheaper plan taken off (RM 35.71 before credit). ' +
          'Open Subscription to see everything still unpaid.',
        payload: expect.objectContaining({ amount: '25.71', creditApplied: '10.00' }),
      }),
    );
  });

  it('a bill the credit covers entirely says so — RM 0.00 owed, never the gross', async () => {
    await announceOpenedInvoices([opened({ amount: '0.00', creditApplied: '125.00' })]);

    expect(hoisted.notifyMany).toHaveBeenCalledWith(
      ['user-owner'],
      expect.objectContaining({
        title: 'New bill: RM 0.00',
        body:
          '2026-08-09 to 2026-08-15. RM 125.00 credit from a switch to a cheaper plan taken off ' +
          '(RM 125.00 before credit). Open Subscription to see everything still unpaid.',
      }),
    );
  });

  it('sums the credits of every line one night opened for the org', async () => {
    await announceOpenedInvoices([
      opened({ amount: '115.00', creditApplied: '10.00' }),
      opened({ amount: '50.00', creditApplied: null }),
    ]);

    expect(hoisted.notifyMany).toHaveBeenCalledWith(
      ['user-owner'],
      expect.objectContaining({
        title: 'New bill: RM 165.00',
        body:
          '2026-08-09 to 2026-08-15, across 2 lines. RM 10.00 credit from a switch to a cheaper plan ' +
          'taken off (RM 175.00 before credit). Open Subscription to see everything still unpaid.',
        payload: expect.objectContaining({ amount: '165.00', creditApplied: '10.00', count: 2 }),
      }),
    );
  });
});
