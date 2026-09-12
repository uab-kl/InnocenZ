import type { PrCurrentWeek, PrReceiptLine } from './api';
import { agencyResolver, weekRecordsFromLines } from './week-agency-split';

/**
 * A PR on two rosters works ONE week and is paid by TWO companies. These tests
 * pin the rule that decides whose money is whose on the live-week card, because
 * getting it wrong does not look like a bug: it looks like a number.
 */

const ATLAS = { id: 'v-atlas', agencyId: 'ag-atlas', agencyName: 'Atlas Agency' };
const WHY = { id: 'v-why', agencyId: 'ag-why', agencyName: 'Why We Met' };

const VOUCHERS: PrCurrentWeek['vouchers'] = [
  { ...ATLAS, voucherNo: 'PV-000004', net: '0', status: 'pending_review' },
  { ...WHY, voucherNo: 'PV-000001', net: '0', status: 'pending_review' },
];

function line(over: Partial<PrReceiptLine> & Pick<PrReceiptLine, "kind" | "commission">): PrReceiptLine {
  return {
    id: Math.random().toString(36).slice(2),
    voucherId: ATLAS.id,
    source: 'manual',
    item: 'x',
    quantity: 1,
    sales: 0,
    lineDate: '2026-09-07',
    outlet: 'UAB Emhub',
    at: '2026-09-07T12:00:00.000Z',
    pending: false,
    proofPhotos: [],
    ...over,
  } as PrReceiptLine;
}

describe('weekRecordsFromLines - two agencies on the same night', () => {
  const resolve = agencyResolver(VOUCHERS);

  it("keeps each agency's money in its own record", () => {
    // Arrange - one calendar day, both companies.
    const lines = [
      line({ kind: 'wages', commission: 300, voucherId: ATLAS.id }),
      line({ kind: 'drinks', commission: 50, voucherId: ATLAS.id }),
      line({ kind: 'wages', commission: 200, voucherId: WHY.id, outlet: 'Velvet 23' }),
    ];

    // Act
    const records = weekRecordsFromLines(lines, resolve);

    // Assert
    expect(records).toHaveLength(2);
    const atlas = records.find((r) => r.agencyId === 'ag-atlas');
    const why = records.find((r) => r.agencyId === 'ag-why');
    expect(atlas).toMatchObject({ wages: 300, drinks: 50, agencyName: "Atlas Agency" });
    expect(why).toMatchObject({ wages: 200, drinks: 0, agencyName: "Why We Met" });
  });

  it('preserves the week total, so the card still agrees with Payment', () => {
    const lines = [
      line({ kind: 'wages', commission: 300, voucherId: ATLAS.id }),
      line({ kind: 'tips', commission: 25.5, voucherId: ATLAS.id }),
      line({ kind: 'wages', commission: 200, voucherId: WHY.id }),
      line({ kind: 'others', commission: 12.25, voucherId: WHY.id }),
    ];

    const records = weekRecordsFromLines(lines, resolve);

    const split = records.reduce(
      (sum, r) => sum + r.wages + r.drinks + r.tips + r.others,
      0,
    );
    const flat = lines.reduce((sum, l) => sum + l.commission, 0);
    expect(split).toBeCloseTo(flat, 2);
  });
});

describe('weekRecordsFromLines - the rules it must NOT break', () => {
  const resolve = agencyResolver(VOUCHERS);

  it('still merges two venues worked for ONE agency into one day, naming both', () => {
    const lines = [
      line({ kind: 'wages', commission: 300, outlet: 'UAB Emhub' }),
      line({ kind: 'drinks', commission: 40, outlet: 'Velvet 23' }),
    ];

    const records = weekRecordsFromLines(lines, resolve);

    expect(records).toHaveLength(1);
    expect(records[0].outlet).toBe('UAB Emhub · Velvet 23');
    expect(records[0].wages).toBe(300);
    expect(records[0].drinks).toBe(40);
  });

  it("separates one agency's two different days", () => {
    const lines = [
      line({ kind: 'wages', commission: 300, lineDate: '2026-09-07' }),
      line({ kind: 'wages', commission: 280, lineDate: '2026-09-08' }),
    ];

    expect(weekRecordsFromLines(lines, resolve)).toHaveLength(2);
  });

  it('drops a line with no date rather than bucketing it somewhere', () => {
    const records = weekRecordsFromLines([line({ kind: 'wages', commission: 300, lineDate: null })], resolve);
    expect(records).toHaveLength(0);
  });
});

describe('agencyResolver - what it refuses to guess', () => {
  it('returns null for a voucher it cannot resolve, never the first agency', () => {
    const resolve = agencyResolver(VOUCHERS);
    expect(resolve('v-unknown')).toBeNull();
    expect(resolve(null)).toBeNull();
    expect(resolve(undefined)).toBeNull();
  });

  it('leaves every line unattributed when the backend sends no vouchers', () => {
    // The pre-0129 payload. One bucket per day, exactly as it always was.
    const resolve = agencyResolver(undefined);
    const records = weekRecordsFromLines(
      [
        line({ kind: 'wages', commission: 300, voucherId: ATLAS.id }),
        line({ kind: 'wages', commission: 200, voucherId: WHY.id }),
      ],
      resolve,
    );

    expect(records).toHaveLength(1);
    expect(records[0].agencyId).toBeNull();
    expect(records[0].wages).toBe(500);
  });
});

/**
 * A late-cancel fee is a LINE, dated to the shift that was NOT worked. It must
 * never be mistaken for evidence that a shift happened, and it must never
 * vanish into another bucket.
 *
 * Both halves are money a PR reads and acts on: a card for a shift they never
 * worked, or a number quietly smaller than the parts beside it explain.
 */
describe('weekRecordsFromLines - a late-cancel fee', () => {
  const resolve = agencyResolver(VOUCHERS);

  it('does not open a day of its own', () => {
    // A fee and nothing else, on a day with no earnings at all.
    const records = weekRecordsFromLines(
      [
        line({
          kind: 'others',
          component: 'deduction',
          commission: -120,
          lineDate: '2026-09-09',
        }),
      ],
      resolve,
    );

    // No card: the PR did not work that night, which is WHY they were charged.
    expect(records).toHaveLength(0);
  });

  it('reduces a day that was worked, on its own field rather than inside others', () => {
    const records = weekRecordsFromLines(
      [
        line({ kind: 'wages', commission: 300 }),
        line({ kind: 'others', commission: 40 }),
        line({ kind: 'others', component: 'deduction', commission: -120 }),
      ],
      resolve,
    );

    expect(records).toHaveLength(1);
    // `others` is untouched — the fine used to be summed into it, so this read
    // -80 and the card said so without ever naming the charge.
    expect(records[0].others).toBe(40);
    // Held NEGATIVE, matching the pay grid: the renderer prints the sign.
    expect(records[0].deductions).toBe(-120);
    // And the money still nets out where it did before the split.
    expect(
      records[0].wages + records[0].others + (records[0].deductions ?? 0),
    ).toBe(220);
  });

  it('leaves a clean day with no deduction field at all', () => {
    const records = weekRecordsFromLines(
      [line({ kind: 'wages', commission: 300 })],
      resolve,
    );

    // `undefined`, not 0 — "no charge" and "a charge netting to nothing" are
    // different answers, and the card branches on which it got.
    expect(records[0].deductions).toBeUndefined();
  });
});
