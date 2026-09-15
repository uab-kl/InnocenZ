import { describe, expect, test, vi } from 'vitest';

// The module under test opens repositories, the database and the env at load
// time; the rules tested here are pure, so those are stubbed rather than connected.
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/env.js', () => ({ env: {} }));
vi.mock('@/features/agency/agency-member.repository.js', () => ({ AgencyMemberRepositoryClass: class {} }));
vi.mock('@/features/outlet/outlet-member.repository.js', () => ({ OutletMemberRepositoryClass: class {} }));
vi.mock('./subscription-payment.repository.js', () => ({ SubscriptionPaymentRepositoryClass: class {} }));
vi.mock('@/features/notification/notify.js', () => ({ notifyMany: vi.fn() }));

import type { PaymentMethod } from '@/features/payment-method/payment-method.model.js';
import {
  AUTO_CHARGE_ACTOR,
  type AutoChargeCandidate,
  autoChargeDecision,
  autoChargeFailedMessage,
  autoChargeInFlight,
  autoChargeOrderId,
  formatBillAmount,
  invoiceIdFromAutoChargeOrderId,
  manualPaymentInFlight,
  runAutoCharge,
} from './auto-charge.js';

/**
 * The owner's rule (15 Sep 2026): "once make payment with the payment method
 * will auto charge next time untill if insufficient balance need notify".
 */
const kl = (iso: string) => new Date(`${iso}+08:00`);

function method(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: 'pm-1',
    outletId: 'outlet-1',
    agencyId: null,
    type: 'card',
    brand: 'Visa',
    last4: '4242',
    expMonth: 11,
    expYear: 2029,
    holderName: null,
    billingEmail: 'owner@venue.test',
    mandateStatus: null,
    mandateReference: null,
    bankCode: null,
    bankName: null,
    walletProvider: null,
    gateway: 'fiuu',
    gatewayToken: 'tok_123',
    autoPay: true,
    isDefault: true,
    status: 'active',
    createdAt: kl('2026-09-01T15:00:00'),
    // Last set up (token written) on 10 Sep.
    updatedAt: kl('2026-09-10T15:00:00'),
    createdBy: 'owner',
    updatedBy: 'owner',
    ...overrides,
  };
}

const wallet = (walletProvider: string) =>
  method({ type: 'ewallet', brand: 'eWallet', walletProvider, last4: null, expMonth: null, expYear: null });

type Bill = Parameters<typeof autoChargeDecision>[0];

/** The Sunday 13 Sep agency week, opened by the 03:00 job — after the card was set up. */
function bill(overrides: Partial<Omit<AutoChargeCandidate, 'method'>> & { method?: PaymentMethod } = {}): Bill {
  return {
    periodStart: '2026-09-13',
    amount: '125.00',
    invoiceCreatedAt: kl('2026-09-13T03:00:00'),
    laneStatus: 'active',
    laneEndedAt: null,
    method: method(),
    ...overrides,
  };
}

const decide = (candidate: Bill) => autoChargeDecision(candidate, 'fiuu', '2026-09-13');

describe('autoChargeDecision', () => {
  test('a bill opened after the card was set up is charged', () => {
    expect(decide(bill())).toEqual({ charge: true });
  });

  test('a bill opened BEFORE the card was set up is not — no surprise back-charges', () => {
    expect(decide(bill({ invoiceCreatedAt: kl('2026-09-06T03:00:00'), periodStart: '2026-09-06' }))).toEqual({
      charge: false,
      reason: 'before_saved',
    });
  });

  test('re-saving an old card moves the cutoff forward, not back', () => {
    // Row created 1 Sep, re-saved (updated in place) on 14 Sep: the 13 Sep bill
    // pre-dates the re-save and must not be swept up by it.
    const resaved = method({ updatedAt: kl('2026-09-14T10:00:00') });
    expect(decide(bill({ method: resaved }))).toEqual({ charge: false, reason: 'before_saved' });
  });

  test('an upgrade bill opened mid-period after the save IS charged, though its period began earlier', () => {
    expect(
      decide(bill({ periodStart: '2026-09-06', amount: '3000.00', invoiceCreatedAt: kl('2026-09-12T03:30:00') })),
    ).toEqual({ charge: true });
  });

  test('an RM 0.00 bill a credit covered is not sent to the gateway', () => {
    expect(decide(bill({ amount: '0.00' }))).toEqual({ charge: false, reason: 'nothing_due' });
  });

  test('a bill on a lane the org has left is not charged', () => {
    expect(decide(bill({ laneStatus: 'cancelled' }))).toEqual({ charge: false, reason: 'lane_ended' });
    expect(decide(bill({ laneEndedAt: kl('2026-09-12T00:00:00') }))).toEqual({
      charge: false,
      reason: 'lane_ended',
    });
    expect(decide(bill({ laneStatus: 'past_due' }))).toEqual({ charge: true });
  });

  test('a period that has not started yet is not charged early', () => {
    expect(decide(bill({ periodStart: '2026-09-20' }))).toEqual({ charge: false, reason: 'not_started' });
  });

  test('no token, auto-pay off, or a removed card — never charged', () => {
    expect(decide(bill({ method: method({ gatewayToken: null }) }))).toEqual({
      charge: false,
      reason: 'not_chargeable',
    });
    expect(decide(bill({ method: method({ autoPay: false }) }))).toEqual({ charge: false, reason: 'not_chargeable' });
    expect(decide(bill({ method: method({ status: 'removed' }) }))).toEqual({
      charge: false,
      reason: 'not_chargeable',
    });
  });

  test('an FPX mandate is refused by name, even active with a token', () => {
    const mandate = method({ type: 'fpx_mandate', mandateStatus: 'active', last4: null });
    expect(decide(bill({ method: mandate }))).toEqual({ charge: false, reason: 'not_chargeable' });
  });

  test('a token saved with another gateway is not sent to this one', () => {
    expect(decide(bill({ method: method({ gateway: 'chip' }) }))).toEqual({ charge: false, reason: 'other_gateway' });
  });

  test("a linked Touch 'n Go wallet is charged; GrabPay, ShopeePay and Boost never are", () => {
    expect(decide(bill({ method: wallet('TNG') }))).toEqual({ charge: true });
    for (const provider of ['GRABPAY', 'SHOPEEPAY', 'BOOST']) {
      expect(decide(bill({ method: wallet(provider) }))).toEqual({ charge: false, reason: 'not_chargeable' });
    }
  });
});

describe('payments already on their way', () => {
  const now = kl('2026-09-20T04:00:00');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  test('a company FPX B2B payment waiting 3 days for its authoriser blocks the card charge', () => {
    expect(manualPaymentInFlight([{ status: 'pending', createdBy: 'user-finance', updatedAt: daysAgo(3) }], now)).toBe(
      true,
    );
  });

  test('a checkout abandoned 8 days ago no longer blocks automatic payment', () => {
    expect(manualPaymentInFlight([{ status: 'pending', createdBy: 'user-finance', updatedAt: daysAgo(8) }], now)).toBe(
      false,
    );
  });

  test('a failed manual attempt does not block', () => {
    expect(manualPaymentInFlight([{ status: 'failed', createdBy: 'user-finance', updatedAt: daysAgo(1) }], now)).toBe(
      false,
    );
  });

  test('Pay now is refused while the automatic charge is still processing', () => {
    expect(autoChargeInFlight([{ status: 'pending', createdBy: AUTO_CHARGE_ACTOR, updatedAt: daysAgo(0) }], now)).toBe(
      true,
    );
    expect(
      autoChargeInFlight([{ status: 'initiated', createdBy: AUTO_CHARGE_ACTOR, updatedAt: daysAgo(1) }], now),
    ).toBe(true);
  });

  test('a declined or stranded automatic charge never locks the owner out of paying by hand', () => {
    expect(autoChargeInFlight([{ status: 'failed', createdBy: AUTO_CHARGE_ACTOR, updatedAt: daysAgo(0) }], now)).toBe(
      false,
    );
    expect(autoChargeInFlight([{ status: 'pending', createdBy: AUTO_CHARGE_ACTOR, updatedAt: daysAgo(3) }], now)).toBe(
      false,
    );
    expect(autoChargeInFlight([{ status: 'pending', createdBy: 'user-owner', updatedAt: daysAgo(0) }], now)).toBe(false);
  });
});

describe('the automatic order id', () => {
  const invoiceId = '3f2b8c1e-9a4d-4e7b-8c21-5d6e7f809a1b';

  test('is deterministic, 34 characters, and gives the invoice back', () => {
    const orderId = autoChargeOrderId(invoiceId);
    expect(orderId).toBe('AC3f2b8c1e9a4d4e7b8c215d6e7f809a1b');
    expect(orderId).toHaveLength(34);
    expect(autoChargeOrderId(invoiceId)).toBe(orderId);
    expect(invoiceIdFromAutoChargeOrderId(orderId)).toBe(invoiceId);
  });

  test('a manual checkout reference is not mistaken for one', () => {
    expect(invoiceIdFromAutoChargeOrderId('chk_3f2b8c1e_m1abc')).toBeNull();
    expect(invoiceIdFromAutoChargeOrderId('AC123')).toBeNull();
  });
});

describe('the switch', () => {
  test('with AUTO_CHARGE_ENABLED unset, a run charges nothing and touches no database', async () => {
    // `db` is mocked as an empty object: any query would throw.
    const result = await runAutoCharge(kl('2026-09-13T04:00:00'));
    expect(result.enabled).toBe(false);
    expect(result.charged).toBe(0);
    expect(result.scanned).toBe(0);
  });
});

describe('the failure notice', () => {
  test('names the amount, the period, the reason and what to do next', () => {
    const message = autoChargeFailedMessage({
      amount: '6999.00',
      currency: 'MYR',
      periodStart: '2026-10-03',
      periodEnd: '2026-11-02',
      methodType: 'card',
      reason: 'Insufficient balance',
    });
    expect(message.title).toBe('Automatic payment failed: RM 6,999.00');
    expect(message.body).toContain('your card');
    expect(message.body).toContain('2026-10-03 to 2026-11-02');
    expect(message.body).toContain('(Insufficient balance)');
    expect(message.body).toContain('pay it by FPX or e-wallet');
  });

  test('says e-wallet for a wallet and leaves out an empty reason', () => {
    const message = autoChargeFailedMessage({
      amount: '125',
      currency: 'MYR',
      periodStart: '2026-09-13',
      periodEnd: '2026-09-19',
      methodType: 'ewallet',
      reason: '   ',
    });
    expect(message.title).toBe('Automatic payment failed: RM 125.00');
    expect(message.body).toContain('your e-wallet');
    expect(message.body).not.toContain('(');
  });

  test('money is formatted from integer cents', () => {
    expect(formatBillAmount('1500.1', 'MYR')).toBe('RM 1,500.10');
    expect(formatBillAmount('9999.99', 'MYR')).toBe('RM 9,999.99');
    expect(formatBillAmount('0.29', 'MYR')).toBe('RM 0.29');
  });
});
