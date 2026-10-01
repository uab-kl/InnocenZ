// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test as globals.
import type { NotificationKind, NotificationRecord } from './api';
import {
  notificationDestination,
  notificationStayReason,
  notificationSubject,
  type DestinationContext,
} from './notification-targets';

/*
 * WHERE A TAPPED NOTIFICATION LANDS — one rule per server kind, each fed the
 * payload its PRODUCER writes (apps/backend … notification producers, read
 * 29 Sep 2026). Before this, only a voucher opened anything.
 */

function row(
  kind: NotificationKind,
  payload: Record<string, unknown> | null,
): Pick<NotificationRecord, 'kind' | 'payload'> {
  return { kind, payload };
}

/** Nothing loaded yet — history unknown, no open week, no assignments. */
const EMPTY: DestinationContext = { assignments: [], thisWeek: null, closedVouchers: null };

/** A PR on two rosters, the week of 21–27 Sep closed, 28 Sep – 4 Oct open. */
const LOADED: DestinationContext = {
  assignments: [
    { id: 'as-booked', shiftDate: '2026-10-03', agencyId: 'ag-atlas' },
    { id: 'as-cancelled', shiftDate: '2026-10-02', agencyId: 'ag-atlas' },
    { id: 'as-last-week', shiftDate: '2026-09-24', agencyId: 'ag-velvet' },
  ],
  thisWeek: {
    weekStart: '2026-09-28',
    weekEnd: '2026-10-04',
    voucherIds: ['pv-open-atlas'],
  },
  closedVouchers: [
    { voucherId: 'pv-atlas', agencyId: 'ag-atlas', weekStart: '2026-09-21', weekEnd: '2026-09-27' },
    {
      voucherId: 'pv-velvet',
      agencyId: 'ag-velvet',
      // A timestamp, as some rows arrive — only the day counts.
      weekStart: '2026-09-21T00:00:00.000Z',
      weekEnd: '2026-09-27T00:00:00.000Z',
    },
    { voucherId: 'pv-old', agencyId: 'ag-atlas', weekStart: '2026-09-07', weekEnd: '2026-09-13' },
  ],
};

describe('vouchers — issued, paid, dispute resolved', () => {
  test.each(['payment_voucher_issued', 'payment_voucher_paid', 'payment_voucher_dispute_resolved'] as const)(
    '%s opens its closed-week voucher',
    (kind) => {
      expect(notificationDestination(row(kind, { voucherId: 'pv-atlas' }), LOADED)).toEqual({
        to: 'pv',
        pvId: 'pv-atlas',
      });
    },
  );

  test("a voucher of the OPEN week goes to Payment → This week — PV detail can't show it", () => {
    // PvDetailScreen falls back to LAST week for an id it cannot find, so
    // sending the open week's voucher there showed the PR the wrong document.
    expect(
      notificationDestination(
        row('payment_voucher_dispute_resolved', { voucherId: 'pv-open-atlas', disputeId: 'd1', outcome: 'accepted' }),
        LOADED,
      ),
    ).toEqual({ to: 'paymentThisWeek' });
  });

  test('a voucher a LOADED history does not hold opens nothing rather than the wrong PV', () => {
    expect(notificationDestination(row('payment_voucher_issued', { voucherId: 'pv-gone' }), LOADED)).toBeNull();
  });

  test('while history is still unknown, the id is trusted as it came', () => {
    expect(notificationDestination(row('payment_voucher_paid', { voucherId: 'pv-x' }), EMPTY)).toEqual({
      to: 'pv',
      pvId: 'pv-x',
    });
  });

  test('no voucher id — nothing to open', () => {
    expect(notificationDestination(row('payment_voucher_issued', { voucherNo: 'PV-000001' }), LOADED)).toBeNull();
  });
});

describe('shifts — assigned, cancelled, released early', () => {
  test('a new shift opens its day on the schedule', () => {
    expect(
      notificationDestination(
        row('shift_assigned', { assignmentId: 'as-booked', shiftId: 's1', shiftDate: '2026-10-03' }),
        LOADED,
      ),
    ).toEqual({ to: 'scheduleDay', dateIso: '2026-10-03', assignmentId: 'as-booked' });
  });

  test('a booking not in the loaded list still opens its day — carrying WHICH booking', () => {
    // Newer than this phone's list, or removed since the notice: the list
    // cannot tell. The schedule re-reads on arrival and the day's sheet shows
    // the fresh row — or says the booking is gone, instead of a bare month.
    expect(
      notificationDestination(
        row('shift_assigned', { assignmentId: 'as-new', shiftId: 's9', shiftDate: '2026-10-09' }),
        LOADED,
      ),
    ).toEqual({ to: 'scheduleDay', dateIso: '2026-10-09', assignmentId: 'as-new' });
  });

  test('the loaded row wins over the payload when both name a day', () => {
    expect(
      notificationDestination(
        row('shift_assigned', { assignmentId: 'as-booked', shiftDate: '2026-01-01' }),
        LOADED,
      ),
    ).toEqual({ to: 'scheduleDay', dateIso: '2026-10-03', assignmentId: 'as-booked' });
  });

  test('an agency-CANCELLED booking (the row stays) opens its day, where it reads Cancelled', () => {
    expect(
      notificationDestination(row('shift_cancelled', { assignmentId: 'as-cancelled', shiftId: 's2' }), LOADED),
    ).toEqual({ to: 'scheduleDay', dateIso: '2026-10-02', assignmentId: 'as-cancelled' });
  });

  test('an UNASSIGNED booking (the row is deleted, no day on the wire) stays on the list', () => {
    expect(
      notificationDestination(row('shift_cancelled', { assignmentId: 'as-deleted', shiftId: 's3' }), LOADED),
    ).toBeNull();
  });

  test('a shift the venue WITHDREW is gone with its bookings — stays on the list', () => {
    expect(
      notificationDestination(
        row('shift_cancelled', { shiftId: 's4', shiftDate: '2026-10-05', outletName: 'Velvet', withdrawn: true }),
        LOADED,
      ),
    ).toBeNull();
    // Pinned on `withdrawn` itself, not on the id happening to be absent: even a
    // withdrawal naming a booking this phone still holds (a stale list) must not
    // send the PR to a day whose booking was deleted.
    expect(
      notificationDestination(
        row('shift_cancelled', { assignmentId: 'as-booked', shiftDate: '2026-10-03', withdrawn: true }),
        LOADED,
      ),
    ).toBeNull();
  });

  test('released early opens the shift it cut short', () => {
    expect(
      notificationDestination(
        row('shift_released_early', { requestId: 'r1', assignmentId: 'as-booked', shiftId: 's1', payAmount: '120.00' }),
        LOADED,
      ),
    ).toEqual({ to: 'scheduleDay', dateIso: '2026-10-03', assignmentId: 'as-booked' });
  });
});

describe('MC / leave decided', () => {
  test.each(['approved', 'rejected'])('%s opens the shift the leave was asked on', (decision) => {
    expect(
      notificationDestination(
        row('leave_decided', { assignmentId: 'as-booked', shiftId: 's1', decision }),
        LOADED,
      ),
    ).toEqual({ to: 'scheduleDay', dateIso: '2026-10-03', assignmentId: 'as-booked' });
  });

  test('an assignment this phone does not hold (no day on the wire) stays on the list', () => {
    expect(
      notificationDestination(row('leave_decided', { assignmentId: 'as-unknown', decision: 'approved' }), LOADED),
    ).toBeNull();
  });
});

describe('overtime decided — the money, on the week that carries it', () => {
  test('this week → Payment → This week', () => {
    expect(
      notificationDestination(
        row('overtime_decided', {
          assignmentId: 'as-booked',
          decision: 'approve',
          overtimeMinutes: 30,
          shiftDate: '2026-10-03',
          amount: '18.75',
        }),
        LOADED,
      ),
    ).toEqual({ to: 'paymentThisWeek' });
  });

  test('a closed week with TWO agencies → the voucher of the agency that booked the shift', () => {
    expect(
      notificationDestination(
        row('overtime_decided', { assignmentId: 'as-last-week', decision: 'reject', shiftDate: '2026-09-24' }),
        LOADED,
      ),
    ).toEqual({ to: 'pv', pvId: 'pv-velvet' });
  });

  test('a closed week with ONE voucher → that voucher, even without the assignment loaded', () => {
    expect(
      notificationDestination(
        row('overtime_decided', { assignmentId: 'as-unknown', decision: 'approve', shiftDate: '2026-09-09' }),
        LOADED,
      ),
    ).toEqual({ to: 'pv', pvId: 'pv-old' });
  });

  test('two vouchers and no way to tell which → the shift itself, not a guess', () => {
    expect(
      notificationDestination(
        row('overtime_decided', { assignmentId: 'as-unknown', decision: 'approve', shiftDate: '2026-09-24' }),
        LOADED,
      ),
    ).toEqual({ to: 'scheduleDay', dateIso: '2026-09-24', assignmentId: 'as-unknown' });
  });

  test('no week loaded yet → the shift it was worked on', () => {
    expect(
      notificationDestination(
        row('overtime_decided', { assignmentId: 'as-booked', decision: 'approve' }),
        { ...EMPTY, assignments: LOADED.assignments },
      ),
    ).toEqual({ to: 'scheduleDay', dateIso: '2026-10-03', assignmentId: 'as-booked' });
  });

  test('nothing to go on at all → stays on the list', () => {
    expect(notificationDestination(row('overtime_decided', { decision: 'approve' }), LOADED)).toBeNull();
  });
});

describe('membership and agency messages', () => {
  test.each([
    { agencyId: 'ag-atlas', userId: 'u1', approveStatus: 'approved' },
    { agencyId: 'ag-atlas', userId: 'u1', approveStatus: 'left' },
    { prId: 'p1', agencyId: 'ag-atlas', userId: 'u1', status: 'inactive' },
  ])('a join / departure decision opens Profile, where the agencies are — %o', (payload) => {
    expect(notificationDestination(row('agency_join_resolved', payload), EMPTY)).toEqual({ to: 'profile' });
  });

  test("an agency's own broadcast has nothing to open — stays on the list", () => {
    expect(notificationDestination(row('agency_broadcast', { agencyId: 'ag-atlas' }), LOADED)).toBeNull();
  });

  test('a swap request (riding agency_broadcast) opens To-do, where it is answered', () => {
    expect(
      notificationDestination(
        row('agency_broadcast', { swapId: 'sw1', assignmentId: 'as-booked', shiftDate: '2026-10-03' }),
        LOADED,
      ),
    ).toEqual({ to: 'swapRequests', swapId: 'sw1' });
  });
});

/*
 * A SWAP NOTICE OUTLIVES ITS SWAP (29 Sep 2026). The request dies once it is
 * answered, and the notice stays in the bell — tapping it opened To-do on
 * nothing. Live: all 4 swap requests on the shared database are 'approved'.
 */
describe('a swap notice whose request is no longer waiting', () => {
  const swapNotice = row('agency_broadcast', {
    swapId: 'sw1',
    assignmentId: 'as-booked',
    shiftDate: '2026-10-03',
  });
  const withSwaps = (swaps: DestinationContext['swaps']): DestinationContext => ({
    ...LOADED,
    swaps,
  });

  test('still waiting for her answer → To-do, and nothing to explain', () => {
    const ctx = withSwaps([{ id: 'sw1', status: 'pending_pr' }]);
    expect(notificationDestination(swapNotice, ctx)).toEqual({ to: 'swapRequests', swapId: 'sw1' });
    expect(notificationStayReason(swapNotice, ctx)).toBeNull();
  });

  test.each([
    ['approved', 'swapAccepted'],
    ['declined', 'swapDeclined'],
    ['cancelled', 'swapWithdrawn'],
  ] as const)('%s → stays on the list, saying %s', (status, reason) => {
    const ctx = withSwaps([{ id: 'sw1', status }]);
    expect(notificationDestination(swapNotice, ctx)).toBeNull();
    expect(notificationStayReason(swapNotice, ctx)).toBe(reason);
  });

  test('gone from her list (deleted with its shift or booking) → stays, "no longer open"', () => {
    const ctx = withSwaps([{ id: 'sw-other', status: 'pending_pr' }]);
    expect(notificationDestination(swapNotice, ctx)).toBeNull();
    expect(notificationStayReason(swapNotice, ctx)).toBe('swapClosed');
    // An empty list is a KNOWN answer, not an unknown one.
    expect(notificationStayReason(swapNotice, withSwaps([]))).toBe('swapClosed');
  });

  test('the list not known yet (loading, failed) → trusted as it came; To-do re-reads', () => {
    expect(notificationDestination(swapNotice, withSwaps(null))).toEqual({
      to: 'swapRequests',
      swapId: 'sw1',
    });
    expect(notificationStayReason(swapNotice, withSwaps(null))).toBeNull();
    expect(notificationStayReason(swapNotice, LOADED)).toBeNull();
  });

  test('only a swap notice ever explains itself — other notices stay silent', () => {
    const ctx = withSwaps([]);
    expect(notificationStayReason(row('agency_broadcast', { agencyId: 'ag-atlas' }), ctx)).toBeNull();
    expect(
      notificationStayReason(row('shift_cancelled', { assignmentId: 'as-deleted' }), ctx),
    ).toBeNull();
  });
});

describe('never a trip to nowhere', () => {
  test.each([
    'overtime_pending_approval',
    'pr_rating_low',
    'cutlost_requested',
    'cutlost_decided',
    'shift_cover_needed',
    'pv_day_review_pending',
    'leave_requested',
    'subscription_tier_weekly',
    'subscription_invoice_opened',
    'subscription_autopay_failed',
  ] as const)('%s is written to agency / outlet members only — stays on the list', (kind) => {
    expect(
      notificationDestination(row(kind, { assignmentId: 'as-booked', voucherId: 'pv-atlas', shiftId: 's1' }), LOADED),
    ).toBeNull();
  });

  test('a kind this build does not know yet is read, not routed — and never throws', () => {
    const future = { kind: 'shift_swapped_by_magic' as NotificationKind, payload: { assignmentId: 'as-booked' } };
    expect(notificationSubject(future)).toBeNull();
    expect(notificationDestination(future, LOADED)).toBeNull();
  });

  test('a missing payload is nothing to open, not a crash', () => {
    expect(notificationDestination(row('shift_assigned', null), LOADED)).toBeNull();
    expect(notificationDestination(row('agency_join_resolved', null), LOADED)).toEqual({ to: 'profile' });
  });

  test('a day that is not a day is ignored, never navigated to', () => {
    expect(
      notificationDestination(row('shift_assigned', { assignmentId: 'as-new', shiftDate: 'tomorrow' }), LOADED),
    ).toBeNull();
  });
});
