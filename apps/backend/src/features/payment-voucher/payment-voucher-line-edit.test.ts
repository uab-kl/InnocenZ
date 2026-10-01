import { describe, expect, it, vi } from 'vitest';

// `wage-line` reaches the repository module, which imports the pool: stubbed so
// nothing here can touch the shared database.
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  addedLineDate,
  planLineRewrite,
  uniqueByRef,
  withCarriedFacts,
  type CarriedFacts,
  type RewrittenFrom,
} from './payment-voucher-line-edit.js';
import { prepareLine } from './payment-voucher-component.js';
import { isWageLineFor } from './wage-line.js';

const ASSIGNMENT = '4ff48fdd-1111-4222-8333-944455556666';
const RECEIPT = '9b48cae3-1111-4222-8333-944455556666';
const FOREIGN_RECEIPT = '0d3c5a1e-1111-4222-8333-944455556666';

const drink: RewrittenFrom = {
  ref: 'drinks|scan|120.00|ORD0389:0|drink',
  lineDate: '2026-09-15',
  description: 'Lemon Drop',
  component: 'drink_commission',
  receiptId: RECEIPT,
};
const tip: RewrittenFrom = {
  ref: 'tips|manual|200.00|ORD0390:0|service',
  lineDate: '2026-09-15',
  description: 'Table service',
  component: 'tip_commission',
  receiptId: RECEIPT,
};
const wage: RewrittenFrom = {
  ref: ASSIGNMENT,
  lineDate: '2026-09-15',
  description: 'Shift on 2026-09-15',
  component: 'wages',
  receiptId: null,
};
const previous = [drink, tip, wage];
const receipts = new Set([RECEIPT]);

/** The payload a faithful editor sends back: every line as it was. */
const roundTrip = previous.map((l) => ({
  ref: l.ref,
  lineDate: l.lineDate,
  description: l.description,
}));

describe('planLineRewrite — what the agency line edit may change', () => {
  it('passes a faithful round trip, including an amount-only correction', () => {
    expect(
      planLineRewrite({ previous, incoming: roundTrip, voucherReceiptIds: receipts }),
    ).toEqual({ ok: true, outletChecks: [] });
  });

  it('refuses moving a receipt line to another day', () => {
    const incoming = roundTrip.map((l, i) => (i === 0 ? { ...l, lineDate: '2026-09-17' } : l));
    const plan = planLineRewrite({ previous, incoming, voucherReceiptIds: receipts });
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.reason).toMatch(/cannot move it to 2026-09-17/);
  });

  it('refuses clearing a receipt line’s day too', () => {
    const incoming = roundTrip.map((l, i) => (i === 1 ? { ...l, lineDate: undefined } : l));
    expect(planLineRewrite({ previous, incoming, voucherReceiptIds: receipts }).ok).toBe(false);
  });

  it('leaves a shift-bound line’s day to the shift check, so a mis-dated wage can be fixed', () => {
    const incoming = roundTrip.map((l, i) => (i === 2 ? { ...l, lineDate: '2026-09-16' } : l));
    expect(planLineRewrite({ previous, incoming, voucherReceiptIds: receipts }).ok).toBe(true);
  });

  it('sends a renamed drink or tip to the outlet-list check', () => {
    const incoming = roundTrip.map((l, i) =>
      i === 0 ? { ...l, description: ' Espresso Martini ' } : i === 1 ? { ...l, description: 'VIP table' } : l,
    );
    expect(planLineRewrite({ previous, incoming, voucherReceiptIds: receipts })).toEqual({
      ok: true,
      outletChecks: [
        { index: 0, receiptId: RECEIPT, kind: 'drinks', description: 'Espresso Martini' },
        { index: 1, receiptId: RECEIPT, kind: 'tips', description: 'VIP table' },
      ],
    });
  });

  it('does not list-check a renamed wage line — wages are not sold by the outlet', () => {
    const incoming = roundTrip.map((l, i) => (i === 2 ? { ...l, description: 'Friday shift' } : l));
    expect(planLineRewrite({ previous, incoming, voucherReceiptIds: receipts })).toEqual({
      ok: true,
      outletChecks: [],
    });
  });

  it('refuses typing a new drink or tip line into the voucher', () => {
    const plan = planLineRewrite({
      previous,
      incoming: [
        ...roundTrip,
        { ref: 'drinks|manual|50.00|NEW:0|drink', lineDate: '2026-09-15', description: 'Anything' },
      ],
      voucherReceiptIds: receipts,
    });
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.reason).toMatch(/Payroll › Receipts/);
  });

  it('treats a duplicated ref as new money, exactly as the carry-forward does', () => {
    // Two logs of one paper share a ref; the repository carries neither link, so
    // the rewrite must not treat either as "the same line".
    const doubled = [drink, { ...drink }];
    const plan = planLineRewrite({
      previous: doubled,
      incoming: [{ ref: drink.ref, lineDate: drink.lineDate, description: drink.description }],
      voucherReceiptIds: receipts,
    });
    expect(plan.ok).toBe(false);
  });

  it('refuses a receipt borrowed from another voucher', () => {
    const plan = planLineRewrite({
      previous,
      incoming: roundTrip.map((l, i) => (i === 2 ? { ...l, receiptId: FOREIGN_RECEIPT } : l)),
      voucherReceiptIds: receipts,
    });
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.reason).toMatch(/not on this voucher/);
  });

  it('still admits new money that is not commission (an adjustment the agency owns)', () => {
    const plan = planLineRewrite({
      previous,
      incoming: [
        ...roundTrip,
        { ref: 'others|manual|20.00||', lineDate: '2026-09-15', description: 'Transport' },
      ],
      voucherReceiptIds: receipts,
    });
    expect(plan.ok).toBe(true);
  });
});

describe('addedLineDate — a line added to a receipt goes on the receipt’s day', () => {
  it('takes the receipt’s day when the caller names none', () => {
    expect(addedLineDate(['2026-09-15', '2026-09-15'], undefined, '2026-09-20')).toEqual({
      ok: true,
      date: '2026-09-15',
    });
  });

  it('refuses a different day the caller picked', () => {
    const out = addedLineDate(['2026-09-15'], '2026-09-18', '2026-09-20');
    expect(out.ok).toBe(false);
  });

  it('accepts the caller naming the receipt’s own day', () => {
    expect(addedLineDate(['2026-09-15'], '2026-09-15', '2026-09-20')).toEqual({
      ok: true,
      date: '2026-09-15',
    });
  });

  it('a receipt with no dated line takes the caller’s day, then the fallback', () => {
    expect(addedLineDate([null], '2026-09-18', '2026-09-20')).toEqual({ ok: true, date: '2026-09-18' });
    expect(addedLineDate([], undefined, '2026-09-20')).toEqual({ ok: true, date: '2026-09-20' });
  });
});

/**
 * 29 Sep 2026 follow-up: a PUT line rewrite dropped a GENERATOR wage line's
 * `component`. Its ref is a bare shift-assignment id, so nothing re-derives it,
 * and the line came back unclassified — Others on the PR's grid, and no longer
 * the shift's wage to `isWageLineFor`, which is what stops a second seal.
 */
describe('withCarriedFacts — what a rewritten line keeps from the one it replaces', () => {
  const stored = (over: Partial<RewrittenFrom & CarriedFacts> = {}) => ({
    ref: ASSIGNMENT as string | null,
    receiptId: null as string | null,
    proofPhotos: null as string[] | null,
    component: 'wages' as CarriedFacts['component'],
    ...over,
  });
  /** How `toLineRows` hands a line on: no component, no receipt, no photos. */
  const fromHttp = (ref: string) => ({
    ref,
    description: 'Shift on 2026-09-15',
    amount: '700.00',
    lineDate: '2026-09-15',
    receiptId: undefined,
    proofPhotos: undefined,
  });

  it('a generator wage, round-tripped, is still the wage — and still that shift’s', () => {
    const line = prepareLine(withCarriedFacts(fromHttp(ASSIGNMENT), uniqueByRef([stored()])));

    expect(line.component).toBe('wages');
    // The line `sealWageLine` / the Sunday net look for before filing a wage:
    // without the component this was false, and the wage would be filed twice.
    expect(isWageLineFor({ ref: line.ref, component: line.component ?? null }, ASSIGNMENT)).toBe(true);
  });

  it('without the carry the same line comes back unclassified (the bug, pinned)', () => {
    const line = prepareLine(withCarriedFacts(fromHttp(ASSIGNMENT), new Map()));
    expect(line.component ?? null).toBeNull();
  });

  it('still carries the receipt link and the PR’s photos, as before', () => {
    const drinkRef = 'drinks|scan|120.00|ORD0389:0|drink';
    const line = withCarriedFacts(
      fromHttp(drinkRef),
      uniqueByRef([
        stored({
          ref: drinkRef,
          receiptId: RECEIPT,
          proofPhotos: ['user/pr/x/receipts/a.jpg'],
          component: 'drink_commission',
        }),
      ]),
    );
    expect(line).toMatchObject({
      receiptId: RECEIPT,
      proofPhotos: ['user/pr/x/receipts/a.jpg'],
      component: 'drink_commission',
    });
  });

  it('an ambiguous ref carries nothing — the classification included', () => {
    const line = withCarriedFacts(fromHttp(ASSIGNMENT), uniqueByRef([stored(), stored()]));
    expect(line.component).toBeUndefined();
    expect(line.receiptId).toBeNull();
  });

  it('a value the incoming line states wins over the carried one', () => {
    const line = withCarriedFacts(
      { ...fromHttp(ASSIGNMENT), component: 'deduction' as const },
      uniqueByRef([stored()]),
    );
    expect(line.component).toBe('deduction');
  });

  it('a pre-classification row (NULL component) still derives from its packed ref', () => {
    const tipRef = 'tips|manual|200.00|ORD0390:0|service';
    const line = prepareLine({
      ...withCarriedFacts(fromHttp(tipRef), uniqueByRef([stored({ ref: tipRef, component: null, receiptId: RECEIPT })])),
    });
    expect(line.component).toBe('tip_commission');
  });
});
