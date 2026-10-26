import { describe, expect, it } from 'vitest';
import {
  assertWrittenMatchesPlan,
  planLine,
  type DerivedLine,
} from './_backfill-voucher-line-outlet-rules';

const EMHUB = '385be5f4-0000-4000-8000-000000000001';
const JK_HOUSE = '6707defc-0000-4000-8000-000000000002';

const line = (over: Partial<DerivedLine> = {}): DerivedLine => ({
  id: '11111111-1111-4111-8111-111111111111',
  voucher_no: 'PV-000009',
  line_date: '2026-09-07',
  component: 'drink_commission',
  stored_text: 'Emhub Testing',
  current_id: null,
  via_receipt: null,
  via_ref: null,
  ...over,
});

describe('planLine', () => {
  it('takes the receipt’s venue first, then the ref’s', () => {
    expect(planLine(line({ via_receipt: EMHUB }))).toEqual({
      method: 'receipt',
      outletId: EMHUB,
    });
    expect(planLine(line({ via_ref: JK_HOUSE }))).toEqual({
      method: 'assignment',
      outletId: JK_HOUSE,
    });
    expect(planLine(line({ via_receipt: EMHUB, via_ref: EMHUB }))).toEqual({
      method: 'receipt',
      outletId: EMHUB,
    });
  });

  it('leaves a line whose receipt and ref disagree NULL', () => {
    expect(planLine(line({ via_receipt: EMHUB, via_ref: JK_HOUSE }))).toEqual({
      method: 'conflict',
      outletId: null,
    });
  });

  it('never guesses from the stored text — a foreign or missing id stays NULL', () => {
    // The tenant-scoped query answers NULL for a foreign receipt/assignment;
    // the venue NAME on the line is not a third way in.
    expect(planLine(line({ stored_text: 'UAB Emhub' }))).toEqual({
      method: 'unresolved',
      outletId: null,
    });
  });
});

describe('assertWrittenMatchesPlan', () => {
  it('passes when the write landed exactly the planned lines', () => {
    expect(() => assertWrittenMatchesPlan(77, 77)).not.toThrow();
    expect(() => assertWrittenMatchesPlan(0, 0)).not.toThrow();
  });

  it('throws — rolling the write back — on more or fewer rows than planned', () => {
    expect(() => assertWrittenMatchesPlan(78, 77)).toThrow(/rolled back/);
    expect(() => assertWrittenMatchesPlan(76, 77)).toThrow(
      /wrote 76 line\(s\) but the plan said 77/,
    );
  });
});
