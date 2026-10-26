import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A voucher line's venue, BY ID (`payment_voucher_line.outlet_id`, 0083).
 *
 * 60 lines kept printing "Emhub Testing" for the venue renamed "UAB Emhub",
 * because the line's venue was free text. The id existed in the database and
 * nothing wrote it. Pins:
 *  - `resolveLineOutletIds` reads the venue from the line's OWN records — its
 *    receipt's shift first, then the assignment its ref names — never from the
 *    text, and never overwrites an id the line already carries;
 *  - it is TENANT-SCOPED: a receipt from another voucher, or an assignment of
 *    another agency (both ids are client-supplied), names no venue;
 *  - `currentVenueNames` summarises a voucher that spans two venues.
 * `@/db/index` is a fake: nothing here can reach the shared database.
 */
const h = vi.hoisted(() => ({ results: [] as unknown[][], selects: 0 }));

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  currentVenueNames,
  PaymentVoucherRepositoryClass,
} from './payment-voucher.repository';

const RECEIPT = '9b48cae3-1111-4222-8333-944455556666';
const RECEIPT_ASSIGNMENT = '1aa48fdd-1111-4222-8333-944455556666';
const WAGE_ASSIGNMENT = '4ff48fdd-1111-4222-8333-944455556666';
const EMHUB = '385be5f4-0000-4000-8000-000000000001';
const JK_HOUSE = '6707defc-0000-4000-8000-000000000002';
const FOREIGN_VENUE = '7c1e0d2a-0000-4000-8000-000000000003';
const VOUCHER = '2bd0b1c4-1111-4222-8333-944455556666';
const OTHER_VOUCHER = '3ce1c2d5-1111-4222-8333-944455556666';
const AGENCY = 'c30fcd15-0000-4000-8000-000000000010';
const OTHER_AGENCY = '665ee433-0000-4000-8000-000000000020';
const FOREIGN_ASSIGNMENT = '5ee48fdd-1111-4222-8333-944455556666';
const FOREIGN_RECEIPT = '8a37bde2-1111-4222-8333-944455556666';

/** The voucher row the resolver reads its agency from. */
const VOUCHER_ROW = [{ agencyId: AGENCY }];

/** A transaction whose every select answers with the next queued result. */
const fakeTx = () => {
  const answer = async () => {
    h.selects += 1;
    return h.results.shift() ?? [];
  };
  const where = () => answer();
  return {
    select: () => ({
      from: () => ({
        where,
        innerJoin: () => ({ where }),
      }),
    }),
  };
};

type Resolver = (
  tx: unknown,
  lines: Array<{
    ref?: string | null;
    receiptId?: string | null;
    outletId?: string | null;
  }>,
  voucherId: string,
) => Promise<Array<{ outletId?: string | null }>>;

const resolve = (tx: unknown, lines: Parameters<Resolver>[1]) =>
  (
    new PaymentVoucherRepositoryClass() as unknown as {
      resolveLineOutletIds: Resolver;
    }
  ).resolveLineOutletIds(tx, lines, VOUCHER);

beforeEach(() => {
  h.results = [];
  h.selects = 0;
});

describe('resolveLineOutletIds', () => {
  it('names a receipt line by its receipt’s shift, and a wage by the assignment its ref packs', async () => {
    h.results = [
      [{ id: RECEIPT, voucherId: VOUCHER, assignmentId: RECEIPT_ASSIGNMENT }],
      VOUCHER_ROW,
      [
        { id: RECEIPT_ASSIGNMENT, agencyId: AGENCY, outletId: EMHUB },
        { id: WAGE_ASSIGNMENT, agencyId: AGENCY, outletId: JK_HOUSE },
      ],
    ];

    const out = await resolve(fakeTx(), [
      { ref: 'drinks|scan|120.00|ORD0389:0|drink', receiptId: RECEIPT },
      { ref: `wages|checkin|700.00|${WAGE_ASSIGNMENT}|` },
    ]);

    expect(out.map((line) => line.outletId)).toEqual([EMHUB, JK_HOUSE]);
  });

  it('prefers the receipt’s shift over a ref naming a different assignment', async () => {
    h.results = [
      [{ id: RECEIPT, voucherId: VOUCHER, assignmentId: RECEIPT_ASSIGNMENT }],
      VOUCHER_ROW,
      [
        { id: RECEIPT_ASSIGNMENT, agencyId: AGENCY, outletId: EMHUB },
        { id: WAGE_ASSIGNMENT, agencyId: AGENCY, outletId: JK_HOUSE },
      ],
    ];

    const [line] = await resolve(fakeTx(), [
      { ref: WAGE_ASSIGNMENT, receiptId: RECEIPT },
    ]);

    expect(line.outletId).toBe(EMHUB);
  });

  it('keeps an id the line already carries (a penalty restored across the rewrite)', async () => {
    h.results = [
      VOUCHER_ROW,
      [{ id: WAGE_ASSIGNMENT, agencyId: AGENCY, outletId: JK_HOUSE }],
    ];

    const [line] = await resolve(fakeTx(), [
      { ref: `${WAGE_ASSIGNMENT}-pen`, outletId: EMHUB },
    ]);

    expect(line.outletId).toBe(EMHUB);
  });

  it('leaves a line naming no receipt and no assignment alone, without a query', async () => {
    const lines = [{ ref: 'drinks|scan|120.00|ORD0389:0|drink' }];

    const out = await resolve(fakeTx(), lines);

    expect(out[0].outletId).toBeUndefined();
    expect(h.selects).toBe(0);
  });

  it('leaves the id unset when the assignment no longer exists', async () => {
    h.results = [VOUCHER_ROW, []];

    const [line] = await resolve(fakeTx(), [{ ref: WAGE_ASSIGNMENT }]);

    expect(line.outletId).toBeUndefined();
  });
});

/**
 * `receiptId` and `ref` are client-supplied (`PaymentVoucherLineSchema`). The
 * query filters by voucher / agency; these pin that a row slipping past it is
 * still dropped, so a foreign id can never write a foreign venue onto a line.
 */
describe('resolveLineOutletIds — tenant scope', () => {
  it('a ref naming ANOTHER agency’s assignment leaves the id NULL', async () => {
    h.results = [
      VOUCHER_ROW,
      [
        {
          id: FOREIGN_ASSIGNMENT,
          agencyId: OTHER_AGENCY,
          outletId: FOREIGN_VENUE,
        },
      ],
    ];

    const out = await resolve(fakeTx(), [
      { ref: `wages|checkin|700.00|${FOREIGN_ASSIGNMENT}|` },
      { ref: `${FOREIGN_ASSIGNMENT}-ot` },
    ]);

    expect(out.map((line) => line.outletId)).toEqual([undefined, undefined]);
  });

  it('a receipt on ANOTHER voucher names no venue — and does not shadow the line’s own ref', async () => {
    h.results = [
      [
        {
          id: FOREIGN_RECEIPT,
          voucherId: OTHER_VOUCHER,
          assignmentId: FOREIGN_ASSIGNMENT,
        },
      ],
      VOUCHER_ROW,
      [
        {
          id: FOREIGN_ASSIGNMENT,
          agencyId: OTHER_AGENCY,
          outletId: FOREIGN_VENUE,
        },
        { id: WAGE_ASSIGNMENT, agencyId: AGENCY, outletId: JK_HOUSE },
      ],
    ];

    const out = await resolve(fakeTx(), [
      { ref: 'drinks|scan|120.00|ORD0389:0|drink', receiptId: FOREIGN_RECEIPT },
      { ref: WAGE_ASSIGNMENT, receiptId: FOREIGN_RECEIPT },
    ]);

    // The first line has nothing else to go on: NULL. The second falls back to
    // its own (in-agency) assignment, never to the foreign receipt's venue.
    expect(out.map((line) => line.outletId)).toEqual([undefined, JK_HOUSE]);
  });

  it('a foreign receipt the query filtered out (no row back) leaves the id NULL, with no assignment read', async () => {
    h.results = [[]];

    const [line] = await resolve(fakeTx(), [
      { ref: 'drinks|scan|120.00|ORD0389:0|drink', receiptId: FOREIGN_RECEIPT },
    ]);

    expect(line.outletId).toBeUndefined();
    expect(h.selects).toBe(1);
  });

  it('names no venue when the voucher itself cannot be read', async () => {
    h.results = [
      [],
      [{ id: WAGE_ASSIGNMENT, agencyId: AGENCY, outletId: JK_HOUSE }],
    ];

    const [line] = await resolve(fakeTx(), [{ ref: WAGE_ASSIGNMENT }]);

    expect(line.outletId).toBeUndefined();
  });
});

describe('currentVenueNames', () => {
  it('lists each venue once, alphabetically, joined by " · "', () => {
    expect(
      currentVenueNames([
        { outletName: 'UAB Emhub' },
        { outletName: 'JK House' },
        { outletName: 'UAB Emhub' },
      ]),
    ).toBe('JK House · UAB Emhub');
  });

  it('is null when no line names a venue, so the caller falls back to the stored text', () => {
    expect(
      currentVenueNames([{ outletName: null }, { outletName: '  ' }, {}]),
    ).toBeNull();
  });
});
