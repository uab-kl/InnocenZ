import { describe, expect, test } from 'vitest';
import {
  isBatchTerminal,
  partitionSettlements,
  projectItemStatuses,
  settlementMarksPaid,
  voucherPayCandidates,
  type SettlementItemView,
  type SettlementRequest,
} from './payout-settlement';

const items: SettlementItemView[] = [
  { id: 'i1', voucherId: 'v1', status: 'sent' },
  { id: 'i2', voucherId: 'v2', status: 'sent' },
  { id: 'i3', voucherId: 'v3', status: 'sent' },
];
const s = (itemId: string, status: SettlementRequest['status']): SettlementRequest => ({
  itemId,
  status,
});

describe('isBatchTerminal', () => {
  test('57 paid and 2 failed IS a finished run', () => {
    // The whole reason payout_batch has no 'failed' state. A partly-bounced run
    // is settled with its failures visible, not held open and not painted red.
    const statuses = [...Array(57).fill('paid'), 'failed', 'failed'];
    expect(isBatchTerminal(statuses as never)).toBe(true);
  });

  test('one line still sent keeps the run open', () => {
    expect(isBatchTerminal(['paid', 'paid', 'sent'])).toBe(false);
  });

  test('one line still pending keeps the run open', () => {
    expect(isBatchTerminal(['paid', 'pending'])).toBe(false);
  });

  test('returned and cancelled are terminal, not outstanding', () => {
    expect(isBatchTerminal(['returned', 'cancelled', 'paid'])).toBe(true);
  });

  test('an empty batch is NOT terminal', () => {
    // Otherwise a batch that failed to insert its items would report itself
    // settled, having paid nobody.
    expect(isBatchTerminal([])).toBe(false);
  });
});

describe('settlementMarksPaid', () => {
  test('only paid moves a voucher', () => {
    expect(settlementMarksPaid('paid')).toBe(true);
    expect(settlementMarksPaid('sent')).toBe(false);
    expect(settlementMarksPaid('failed')).toBe(false);
    expect(settlementMarksPaid('returned')).toBe(false);
  });
});

describe('partitionSettlements', () => {
  test('a line from another batch is reported, never silently dropped', () => {
    const { applicable, unknownItemIds } = partitionSettlements(items, [
      s('i1', 'paid'),
      s('nope', 'paid'),
    ]);
    expect(applicable.map((a) => a.itemId)).toEqual(['i1']);
    expect(unknownItemIds).toEqual(['nope']);
  });

  test('a response naming one line twice collapses to the last', () => {
    // A bank file listing a payment twice must not apply twice.
    const { applicable } = partitionSettlements(items, [s('i1', 'sent'), s('i1', 'paid')]);
    expect(applicable).toEqual([{ itemId: 'i1', status: 'paid' }]);
  });

  test('an empty request touches nothing', () => {
    expect(partitionSettlements(items, [])).toEqual({
      applicable: [],
      unknownItemIds: [],
    });
  });
});

describe('projectItemStatuses', () => {
  test('unsettled lines keep their current status', () => {
    expect(projectItemStatuses(items, [s('i2', 'paid')])).toEqual(['sent', 'paid', 'sent']);
  });

  test('a partial bank response can finish a run', () => {
    const after = projectItemStatuses(items, [
      s('i1', 'paid'),
      s('i2', 'failed'),
      s('i3', 'paid'),
    ]);
    expect(isBatchTerminal(after)).toBe(true);
  });

  test('a response that misses a line leaves the run open', () => {
    const after = projectItemStatuses(items, [s('i1', 'paid'), s('i2', 'paid')]);
    expect(isBatchTerminal(after)).toBe(false);
  });
});

describe('voucherPayCandidates', () => {
  test('only paid lines nominate their voucher', () => {
    expect(
      voucherPayCandidates(items, [s('i1', 'paid'), s('i2', 'failed'), s('i3', 'paid')]),
    ).toEqual(['v1', 'v3']);
  });

  test('an unknown line nominates nothing', () => {
    expect(voucherPayCandidates(items, [s('ghost', 'paid')])).toEqual([]);
  });

  test('two lines on one voucher nominate it once — one bell, not two', () => {
    const shared: SettlementItemView[] = [
      { id: 'a', voucherId: 'v9', status: 'sent' },
      { id: 'b', voucherId: 'v9', status: 'sent' },
    ];
    expect(voucherPayCandidates(shared, [s('a', 'paid'), s('b', 'paid')])).toEqual(['v9']);
  });
});
