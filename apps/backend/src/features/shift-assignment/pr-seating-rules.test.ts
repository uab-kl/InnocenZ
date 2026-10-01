import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

/**
 * CAN THIS PR BE SEATED HERE — `pr-seating-rules.ts` (30 Sep 2026).
 *
 *  - the three facts every seating lane reads from the PR's other bookings;
 *  - each lane's own sentence and status, word for word what the controllers
 *    answered before the rules moved here;
 *  - the guard: the shift's seat lock, then the PR's booking lock, then the
 *    shift, its pin and her bookings re-read THROUGH THE TRANSACTION.
 *
 * Pure functions and fakes: nothing here can reach the shared database.
 */
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));

import type { DbTransaction } from '@/types/db-transaction';
import { ShiftWriteRefused } from '@/features/shift/shift-write-guard';
import {
  assignAnswer,
  reStaffAnswer,
  seatFacts,
  seatingRules,
  swapApproveAnswer,
  swapRequestAnswer,
  type SeatReads,
} from './pr-seating-rules';
import { PR_UNAVAILABLE_THEN, type HeldAssignment } from './travel-gap';

const ATLAS = '44444444-4444-4444-8444-444444444444';
const RIVAL = '77777777-7777-4777-8777-777777777777';
const SHIFT = '55555555-5555-4555-8555-555555555555';
const PR = '66666666-6666-4666-8666-666666666666';
const HERE = { outletId: '11111111-1111-4111-8111-111111111111', lat: 3.139, lng: 101.6869 };
// ~20 km away — about 80 minutes door to door by travel-gap.ts's own arithmetic.
const FAR = { outletId: '22222222-2222-4222-8222-222222222222', lat: 3.0738, lng: 101.5183 };

const shift = { id: SHIFT, shiftDate: '2027-03-10', slot: '20:00 - 23:00', outletId: HERE.outletId };

function booking(extra: Partial<HeldAssignment> = {}): HeldAssignment {
  return {
    shiftId: 'other-shift',
    status: 'assigned',
    agencyId: ATLAS,
    shiftDate: '2027-03-10',
    slot: '21:00 - 01:00',
    outletId: FAR.outletId,
    outletName: 'JK House',
    outletLat: FAR.lat,
    outletLng: FAR.lng,
    checkOutAt: null,
    ...extra,
  };
}

const facts = (held: HeldAssignment[], extra: { vacating?: string; pin?: typeof HERE | null } = {}) =>
  seatFacts({
    shift,
    pin: extra.pin === undefined ? HERE : extra.pin,
    held,
    actingAgencyId: ATLAS,
    vacating: extra.vacating,
  });

describe('seatFacts', () => {
  it('already on this very shift — only in a staffing status', () => {
    expect(facts([booking({ shiftId: SHIFT })]).alreadyHere?.shiftId).toBe(SHIFT);
    expect(facts([booking({ shiftId: SHIFT, status: 'cancelled' })]).alreadyHere).toBeUndefined();
  });

  it('an overlapping booking elsewhere is an overlap, whoever holds it', () => {
    expect(facts([booking()]).overlap?.shiftId).toBe('other-shift');
    expect(facts([booking({ agencyId: RIVAL })]).overlap?.agencyId).toBe(RIVAL);
  });

  it.each([
    ['completed', booking({ status: 'completed' })],
    ['checked out', booking({ checkOutAt: new Date('2027-03-10T13:30:00Z') })],
    ['cancelled', booking({ status: 'cancelled' })],
    ['on leave', booking({ status: 'leave_approved' })],
    ['the shift being vacated', booking({ shiftId: 'origin' })],
    ['at a different time', booking({ slot: '12:00 - 15:00' })],
  ])('is not an overlap when %s', (_label, row) => {
    expect(facts([row], { vacating: 'origin' }).overlap).toBeUndefined();
  });

  it('a rival agency’s shift too close to travel from blocks — this agency’s own never does', () => {
    const justBefore = { slot: '17:00 - 19:30' };
    expect(facts([booking({ ...justBefore, agencyId: RIVAL })]).travelBlocked).toBe(true);
    expect(facts([booking({ ...justBefore, agencyId: ATLAS })]).travelBlocked).toBe(false);
    // No pin for this venue: the trip cannot be priced, so it cannot block.
    expect(facts([booking({ ...justBefore, agencyId: RIVAL })], { pin: null }).travelBlocked).toBe(
      false,
    );
  });
});

describe('each lane answers in its own words — unchanged', () => {
  it('POST /shift-assignment: 409 already here, 400 overlap, 400 travel; a rival’s never named', () => {
    expect(assignAnswer(facts([booking({ shiftId: SHIFT })]), ATLAS)).toEqual({
      status: 409,
      message: 'PR is already assigned to this shift',
    });
    expect(assignAnswer(facts([booking({ shiftId: SHIFT, agencyId: RIVAL })]), ATLAS)).toEqual({
      status: 409,
      message: PR_UNAVAILABLE_THEN,
    });
    expect(assignAnswer(facts([booking()]), ATLAS)).toEqual({
      status: 400,
      message:
        'This PR already works 21:00 - 01:00 at JK House that day — pick a time that does not overlap.',
    });
    expect(assignAnswer(facts([booking({ agencyId: RIVAL })]), ATLAS)).toEqual({
      status: 400,
      message: PR_UNAVAILABLE_THEN,
    });
    expect(
      assignAnswer(facts([booking({ slot: '17:00 - 19:30', agencyId: RIVAL })]), ATLAS),
    ).toEqual({ status: 400, message: PR_UNAVAILABLE_THEN });
    expect(assignAnswer(facts([]), ATLAS)).toBeNull();
  });

  it('re-staffing: 409 overlap in its own wording, 409 travel', () => {
    expect(reStaffAnswer(facts([booking()]), ATLAS)).toEqual({
      status: 409,
      message:
        'This PR already works 21:00 - 01:00 at JK House that day — they cannot be put back on this shift.',
    });
    expect(reStaffAnswer(facts([booking({ agencyId: RIVAL })]), ATLAS)).toEqual({
      status: 409,
      message: PR_UNAVAILABLE_THEN,
    });
    expect(
      reStaffAnswer(facts([booking({ slot: '17:00 - 19:30', agencyId: RIVAL })]), ATLAS),
    ).toEqual({ status: 409, message: PR_UNAVAILABLE_THEN });
  });

  const TOO_CLOSE =
    'Another of your shifts is too close to this one — there is not enough time to travel between the venues, so this swap can no longer be approved.';

  it('swap approval: the PR hears her one plain refusal for a trip too short AND for an overlap', () => {
    const tooFar = facts([booking({ slot: '17:00 - 19:30', agencyId: RIVAL })]);
    expect(swapApproveAnswer(tooFar)).toEqual({ status: 409, message: TOO_CLOSE });
    // An overlap, her agency's or a rival's — refused, where it used to be approved.
    expect(swapApproveAnswer(facts([booking()]))).toEqual({ status: 409, message: TOO_CLOSE });
    expect(swapApproveAnswer(facts([booking({ agencyId: RIVAL })]))).toEqual({
      status: 409,
      message: TOO_CLOSE,
    });
    expect(swapApproveAnswer(facts([]))).toBeNull();
  });

  it('raising a swap: an overlap answers EXACTLY as assigning her there would; a short trip keeps its 409', () => {
    const own = facts([booking()]);
    const rival = facts([booking({ agencyId: RIVAL })]);
    expect(swapRequestAnswer(own, ATLAS)).toEqual(assignAnswer(own, ATLAS));
    expect(swapRequestAnswer(rival, ATLAS)).toEqual(assignAnswer(rival, ATLAS));
    expect(swapRequestAnswer(own, ATLAS)).toEqual({
      status: 400,
      message:
        'This PR already works 21:00 - 01:00 at JK House that day — pick a time that does not overlap.',
    });
    expect(
      swapRequestAnswer(facts([booking({ slot: '17:00 - 19:30', agencyId: RIVAL })]), ATLAS),
    ).toEqual({ status: 409, message: PR_UNAVAILABLE_THEN });
    expect(swapRequestAnswer(facts([]), ATLAS)).toBeNull();
  });
});

describe('seatingRules — the check, and the guard inside the write', () => {
  const LOCK_SQL = 'select pg_advisory_xact_lock(hashtextextended($1, 0))';
  const render = (query: unknown) => new PgDialect().sqlToQuery(query as SQL);

  /** Reads that answer from `inside` through a transaction, `outside` through the pool. */
  function reads(log: string[], outside: HeldAssignment[], inside: HeldAssignment[], shiftNow = shift) {
    const via = (client: unknown) => (client ? 'tx' : 'pool');
    const fakes = {
      shiftRepository: {
        getById: vi.fn(async (_id: string, client?: unknown) => {
          log.push(`${via(client)}:shift`);
          return shiftNow;
        }),
      },
      assignments: {
        getOutletPin: vi.fn(async (_outletId: string, client?: unknown) => {
          log.push(`${via(client)}:pin`);
          return HERE;
        }),
        listForPr: vi.fn(async (_prId: string, client?: unknown) => {
          log.push(`${via(client)}:bookings`);
          return client ? inside : outside;
        }),
      },
    };
    return fakes as unknown as SeatReads & typeof fakes;
  }

  function transaction(log: string[]) {
    const executed: unknown[] = [];
    const tx = {
      execute: async (query: unknown) => {
        executed.push(query);
        log.push('tx:lock');
      },
    } as unknown as DbTransaction;
    return { tx, executed };
  }

  const seat = { shiftId: SHIFT, prId: PR, actingAgencyId: ATLAS };

  it('the check reads through the pool, on the shift the caller already holds', async () => {
    const log: string[] = [];
    const r = reads(log, [booking()], []);

    const refused = await seatingRules(r, seat, assignAnswer).check(shift);

    expect(refused?.status).toBe(400);
    expect(log).toEqual(['pool:pin', 'pool:bookings']);
    expect(r.shiftRepository.getById).not.toHaveBeenCalled();
  });

  it('the guard: shift lock, then PR lock, BEFORE any read — then every read through the transaction', async () => {
    const log: string[] = [];
    const r = reads(log, [], []);
    const { tx, executed } = transaction(log);

    await seatingRules(r, seat, assignAnswer).guard(tx);

    expect(log).toEqual(['tx:lock', 'tx:lock', 'tx:shift', 'tx:pin', 'tx:bookings']);
    expect(executed.map(render).map((q) => [q.sql, q.params])).toEqual([
      [LOCK_SQL, [`shift-seat:${SHIFT}`]],
      [LOCK_SQL, [`pr-booking:${PR}`]],
    ]);
    expect(r.assignments.listForPr).toHaveBeenCalledWith(PR, tx);
    expect(r.shiftRepository.getById).toHaveBeenCalledWith(SHIFT, tx);
  });

  it('a booking seen only under the lock is refused in the lane’s own words', async () => {
    const log: string[] = [];
    const r = reads(log, [], [booking()]);

    const clean = await seatingRules(r, seat, assignAnswer).check(shift);
    const refused = await seatingRules(r, seat, assignAnswer)
      .guard(transaction(log).tx)
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(clean).toBeNull();
    expect(refused).toBeInstanceOf(ShiftWriteRefused);
    expect(refused).toMatchObject({
      status: 400,
      message:
        'This PR already works 21:00 - 01:00 at JK House that day — pick a time that does not overlap.',
    });
  });

  it('judges the shift as it stands NOW — an edit may have re-timed it since the check', async () => {
    const log: string[] = [];
    // The caller read 17:00-19:00, clear of her 21:00 booking; it has since moved onto it.
    const movedOnto = { ...shift, slot: '20:00 - 23:00' };
    const r = reads(log, [booking()], [booking()], movedOnto);

    const byTheCheck = await seatingRules(r, seat, assignAnswer).check({
      ...shift,
      slot: '17:00 - 19:00',
    });
    const underLock = await seatingRules(r, seat, assignAnswer)
      .guard(transaction(log).tx)
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(byTheCheck).toBeNull();
    expect(underLock).toMatchObject({ status: 400 });
  });

  it('a shift that is gone is not the guard’s to answer — the write’s own not-found does', async () => {
    const log: string[] = [];
    const r = reads(log, [], [booking()]);
    r.shiftRepository.getById.mockResolvedValueOnce(null as never);

    await expect(seatingRules(r, seat, assignAnswer).guard(transaction(log).tx)).resolves.toBe(
      undefined,
    );
  });
});
