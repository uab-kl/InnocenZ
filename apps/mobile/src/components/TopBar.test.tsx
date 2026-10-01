// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import * as React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocaleProvider } from '../i18n';
import { saveLocale } from '../i18n/locale-prefs';
import { translations } from '../i18n/translations';
import {
  fetchMyNotifications,
  fetchMyOutletSwaps,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRecord,
  type OutletSwapRecord,
} from '../lib/api';
import { TopBar } from './TopBar';

/*
 * THE BELL, rendered for real with the network mocked — nothing is read from or
 * written to a server. Pins the two live faults of 28 Sep 2026:
 *   • the badge counted the loaded page (50) instead of the server's 64;
 *   • "Mark all read" could only reach the page, and the sheet opened outside
 *     the phone frame on the web build.
 */
/*
 * The FIRST test pays for `requireActual('../lib/api')` (expo-constants and the
 * rest of its graph) inside its own time — 2 s alone, but past Jest's 5 s
 * default under a parallel `nx run-many` (29 Sep 2026). Same per-suite budget
 * as SecurityScreen.test.tsx; not a slow bell.
 */
jest.setTimeout(30_000);

jest.mock('../lib/api', () => ({
  ...jest.requireActual('../lib/api'),
  fetchMyNotifications: jest.fn(),
  fetchMyOutletSwaps: jest.fn(),
  fetchUnreadNotificationCount: jest.fn(),
  markAllNotificationsRead: jest.fn(),
  markNotificationRead: jest.fn(),
}));
jest.mock('../lib/session', () => ({
  useSession: () => ({
    token: 'A1',
    me: { id: 'u1', username: 'vicky', profileImage: null, profile: { underAgency: true } },
  }),
}));
const mockOpenPv = jest.fn();
const mockSetTab = jest.fn();
jest.mock('../lib/pr-nav', () => ({
  usePrNav: () => ({ openPv: mockOpenPv, setTab: mockSetTab }),
}));
jest.mock('../lib/awaiting-pv', () => ({ useAwaitingLastWeekPv: () => ({ awaiting: null }) }));
/*
 * What the phone has loaded — where a tapped notification can land. One booked
 * shift on 3 Oct, the open week 28 Sep – 4 Oct, one closed voucher.
 */
jest.mock('../lib/active-shift', () => ({
  useActiveShift: () => ({
    assignments: [{ id: 'as-booked', shiftDate: '2026-10-03', agencyId: 'ag-atlas' }],
  }),
}));
jest.mock('../lib/pr-earnings', () => ({
  usePrEarnings: () => ({
    current: {
      voucherId: 'pv-open',
      weekStart: '2026-09-28',
      weekEnd: '2026-10-04',
      vouchers: [{ id: 'pv-open' }],
    },
  }),
}));
jest.mock('../lib/payment-history', () => ({
  usePaymentHistory: () => ({
    vouchers: [
      { voucherId: 'pv-closed', agencyId: 'ag-atlas', weekStart: '2026-09-21', weekEnd: '2026-09-27' },
    ],
    loading: false,
    error: null,
  }),
}));
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: jest.fn((node: unknown) => node),
}));

const list = fetchMyNotifications as jest.MockedFunction<typeof fetchMyNotifications>;
const swapsRead = fetchMyOutletSwaps as jest.MockedFunction<typeof fetchMyOutletSwaps>;
const count = fetchUnreadNotificationCount as jest.MockedFunction<typeof fetchUnreadNotificationCount>;

/** One of her swap requests, as `/outlet-swap/mine` returns it. */
function swapRecord(id: string, status: OutletSwapRecord['status']): OutletSwapRecord {
  return {
    id,
    assignmentId: 'as-booked',
    status,
    agencyNote: null,
    prNote: null,
    respondedAt: status === 'pending_pr' ? null : '2026-09-29T03:00:00.000Z',
    createdAt: '2026-09-29T02:00:00.000Z',
    fromOutletName: 'Velvet',
    fromSlot: '22:00 - 04:00',
    toOutletName: 'Mermate',
    toSlot: '22:00 - 04:00',
    toEventName: null,
    toShiftDate: '2026-10-03',
  };
}
const markAll = markAllNotificationsRead as jest.MockedFunction<typeof markAllNotificationsRead>;
const markRead = markNotificationRead as jest.MockedFunction<typeof markNotificationRead>;

const EN = translations.en;
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** The newest 50 of 64 — every one unread, the live shape. */
function page(readAt: string | null = null): NotificationRecord[] {
  return Array.from({ length: 50 }, (_, i) => ({
    id: `n${i}`,
    kind: 'shift_assigned' as const,
    title: 'You have a new shift',
    body: '2026-09-30',
    payload: { assignmentId: `a${i}`, shiftDate: '2026-09-30' },
    readAt,
    createdAt: '2026-09-28T10:00:00.000Z',
  }));
}

async function renderBar() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <LocaleProvider>
        <TopBar />
      </LocaleProvider>
    </SafeAreaProvider>,
  );
}

/** The bell button, by the name a screen reader announces. */
function bell(screen: Awaited<ReturnType<typeof renderBar>>) {
  return screen.getByLabelText(EN.topbar.notifications);
}

beforeEach(() => {
  list.mockReset();
  swapsRead.mockReset();
  // Her one swap request is still waiting, unless a test says otherwise.
  swapsRead.mockResolvedValue([swapRecord('sw1', 'pending_pr')]);
  count.mockReset();
  markAll.mockReset();
  markRead.mockReset();
  markRead.mockImplementation(async (_token, id) => ({
    id,
    kind: 'shift_assigned',
    title: '',
    body: null,
    payload: null,
    readAt: '2026-09-29T03:00:00.000Z',
    createdAt: '2026-09-29T02:00:00.000Z',
  }));
  mockOpenPv.mockReset();
  mockSetTab.mockReset();
  saveLocale('en');
});

describe('TopBar bell', () => {
  test('THE BUG: 64 unread on the server, 50 loaded — the badge reads 64, not 50', async () => {
    list.mockResolvedValue(page());
    count.mockResolvedValue(64);

    const screen = await renderBar();

    await waitFor(() => expect(screen.getByText('64')).toBeTruthy());
    expect(screen.queryByText('50')).toBeNull();
  });

  test('past 99 the badge caps rather than overflowing the bell', async () => {
    list.mockResolvedValue(page());
    count.mockResolvedValue(140);

    const screen = await renderBar();

    await waitFor(() => expect(screen.getByText('99+')).toBeTruthy());
  });

  test('Mark all read clears EVERY unread row in one call — including the 14 below the page', async () => {
    list.mockResolvedValue(page());
    count.mockResolvedValue(64);
    markAll.mockImplementation(async () => {
      list.mockResolvedValue(page('2026-09-29T02:00:00.000Z'));
      count.mockResolvedValue(0);
      return 64;
    });

    const screen = await renderBar();
    await waitFor(() => expect(screen.getByText('64')).toBeTruthy());
    await fireEvent.press(bell(screen));
    await fireEvent.press(await screen.findByText(EN.topbar.markAllRead));

    expect(markAll).toHaveBeenCalledTimes(1);
    expect(markAll).toHaveBeenCalledWith('A1');
    await waitFor(() => expect(screen.queryByText('64')).toBeNull());
    expect(screen.queryByText(EN.topbar.markAllRead)).toBeNull();
  });

  test('on the WEB build the sheet opens inside the phone frame, not over the browser window', async () => {
    const { createPortal } = jest.requireMock('react-dom') as { createPortal: jest.Mock };
    createPortal.mockClear();
    const host = { id: 'iz-phone-screen' };
    const doc = globalThis as { document?: unknown };
    const savedDocument = doc.document;
    const savedOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
    doc.document = { getElementById: (id: string) => (id === 'iz-phone-screen' ? host : null) };
    try {
      list.mockResolvedValue([]);
      count.mockResolvedValue(0);
      const screen = await renderBar();
      await fireEvent.press(bell(screen));

      expect(await screen.findByText(EN.topbar.notificationsHint)).toBeTruthy();
      expect(createPortal).toHaveBeenCalledWith(expect.anything(), host);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => savedOs });
      doc.document = savedDocument;
    }
  });
});

/*
 * A TAP OPENS THE ITEM (29 Sep 2026). Only a voucher used to open anything;
 * every other row closed the sheet on nothing. The rules themselves are pinned
 * in lib/notification-targets.test.ts — this pins that the bell FOLLOWS them.
 */
describe('tapping a notification opens its item', () => {
  function notice(
    id: string,
    kind: NotificationRecord['kind'],
    title: string,
    payload: Record<string, unknown>,
  ): NotificationRecord {
    return {
      id,
      kind,
      title,
      body: null,
      payload,
      readAt: null,
      createdAt: '2026-09-29T02:00:00.000Z',
    };
  }

  /** Opens the bell on these rows and taps the one titled `title`. */
  async function tap(rows: NotificationRecord[], title: string) {
    list.mockResolvedValue(rows);
    count.mockResolvedValue(rows.length);
    const screen = await renderBar();
    await waitFor(() => expect(list).toHaveBeenCalled());
    await fireEvent.press(bell(screen));
    await fireEvent.press(await screen.findByText(title));
    return screen;
  }

  test('a new shift → Shifts, its day open on the Agency Schedule — and the sheet closes', async () => {
    const screen = await tap(
      [notice('n1', 'shift_assigned', 'You have a new shift', { assignmentId: 'as-booked', shiftId: 's1', shiftDate: '2026-10-03' })],
      EN.notif.shiftAssignedTitle,
    );
    // The booking rides along, so the day's sheet can say it if it is gone.
    expect(mockSetTab).toHaveBeenCalledWith('shifts', {
      shiftsFocus: { section: 'schedule', dateIso: '2026-10-03', assignmentId: 'as-booked' },
    });
    expect(mockOpenPv).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(EN.topbar.notificationsHint)).toBeNull());
  });

  test('an MC / leave decision → the shift it was asked on', async () => {
    await tap(
      [notice('n2', 'leave_decided', 'MC / leave approved', { assignmentId: 'as-booked', shiftId: 's1', decision: 'approved' })],
      EN.notif.leaveApprovedTitle,
    );
    expect(mockSetTab).toHaveBeenCalledWith('shifts', {
      shiftsFocus: { section: 'schedule', dateIso: '2026-10-03', assignmentId: 'as-booked' },
    });
  });

  test('a closed-week voucher → PV detail, as before', async () => {
    await tap(
      [notice('n3', 'payment_voucher_issued', 'Your payment voucher is ready', { voucherId: 'pv-closed' })],
      EN.notif.pvIssuedTitle,
    );
    expect(mockOpenPv).toHaveBeenCalledWith('pv-closed');
    expect(mockSetTab).not.toHaveBeenCalled();
  });

  test("a dispute on the OPEN week's voucher → Payment → This week, not a PV page that cannot show it", async () => {
    await tap(
      [notice('n4', 'payment_voucher_dispute_resolved', 'Your dispute was accepted', { voucherId: 'pv-open', disputeId: 'd1', outcome: 'accepted' })],
      EN.notif.disputeAcceptedTitle,
    );
    expect(mockSetTab).toHaveBeenCalledWith('payment', { paymentWeek: 'current' });
    expect(mockOpenPv).not.toHaveBeenCalled();
  });

  test("overtime decided this week → Payment → This week, where the week's overtime is", async () => {
    await tap(
      [notice('n5', 'overtime_decided', 'Overtime approved', { assignmentId: 'as-booked', decision: 'approve', overtimeMinutes: 30, shiftDate: '2026-10-03', amount: '18.75' })],
      EN.notif.overtimeApprovedTitle,
    );
    expect(mockSetTab).toHaveBeenCalledWith('payment', { paymentWeek: 'current' });
  });

  test('a swap request still waiting → Shifts → To-do, where it is answered', async () => {
    await tap(
      [notice('n6', 'agency_broadcast', 'Outlet swap — your answer is needed', { swapId: 'sw1', assignmentId: 'as-booked', shiftDate: '2026-10-03' })],
      EN.notif.swapRequestTitle,
    );
    expect(swapsRead).toHaveBeenCalledWith('A1');
    expect(mockSetTab).toHaveBeenCalledWith('shifts', { shiftsFocus: { section: 'todo', swapId: 'sw1' } });
  });

  test('a membership decision → Profile, where the agencies are', async () => {
    await tap(
      [notice('n7', 'agency_join_resolved', 'You were accepted by the agency', { prId: 'p1', agencyId: 'ag-atlas', userId: 'u1', status: 'active' })],
      EN.notif.joinAcceptedTitle,
    );
    expect(mockSetTab).toHaveBeenCalledWith('profile');
  });

  test("nothing to open — an agency's own message: read, and the list STAYS", async () => {
    const screen = await tap(
      [
        notice('n8', 'agency_broadcast', 'Team briefing at 7pm', { agencyId: 'ag-atlas' }),
        notice('n9', 'shift_assigned', 'You have a new shift', { assignmentId: 'as-booked', shiftDate: '2026-10-03' }),
      ],
      'Team briefing at 7pm',
    );
    expect(markRead).toHaveBeenCalledWith('A1', 'n8');
    expect(mockSetTab).not.toHaveBeenCalled();
    expect(mockOpenPv).not.toHaveBeenCalled();
    expect(screen.getByText(EN.topbar.notificationsHint)).toBeTruthy();
    // Only the row that opens something carries the chevron.
    expect(screen.getAllByTestId('notif-opens')).toHaveLength(1);
  });

  test('a shift that no longer exists (unassigned) stays on the list too', async () => {
    const screen = await tap(
      [notice('n10', 'shift_cancelled', 'You were removed from a shift', { assignmentId: 'as-deleted', shiftId: 's3' })],
      EN.notif.shiftCancelledTitle,
    );
    expect(mockSetTab).not.toHaveBeenCalled();
    expect(screen.getByText(EN.topbar.notificationsHint)).toBeTruthy();
    expect(screen.queryByTestId('notif-opens')).toBeNull();
  });

  /*
   * A SWAP NOTICE OUTLIVES ITS SWAP (29 Sep 2026): the request dies once it is
   * answered, the notice stays — and tapping it opened an EMPTY To-do. Every
   * swap request on the shared database is 'approved' today.
   */
  describe('a swap request no longer waiting stays on the list, and says why', () => {
    const swapNotice = notice('n11', 'agency_broadcast', 'Outlet swap — your answer is needed', {
      swapId: 'sw1',
      assignmentId: 'as-booked',
      shiftDate: '2026-10-03',
    });

    async function openBellOn(rows: NotificationRecord[]) {
      list.mockResolvedValue(rows);
      count.mockResolvedValue(rows.length);
      const screen = await renderBar();
      await waitFor(() => expect(list).toHaveBeenCalled());
      await fireEvent.press(bell(screen));
      return screen;
    }

    test.each([
      ['approved', EN.swaps.alreadyAccepted],
      ['declined', EN.swaps.alreadyDeclined],
      ['cancelled', EN.swaps.withdrawn],
    ] as const)('%s → no trip to an empty To-do; the bell says so', async (status, line) => {
      swapsRead.mockResolvedValue([swapRecord('sw1', status)]);
      const screen = await openBellOn([swapNotice]);
      // Once her requests are read, the row stops promising to open anything.
      await waitFor(() => expect(screen.queryByTestId('notif-opens')).toBeNull());

      await fireEvent.press(screen.getByText(EN.notif.swapRequestTitle));

      expect(mockSetTab).not.toHaveBeenCalled();
      expect(screen.getByText(line)).toBeTruthy();
      expect(screen.getByText(EN.topbar.notificationsHint)).toBeTruthy();
      expect(markRead).toHaveBeenCalledWith('A1', 'n11');
    });

    test('a request gone from her list (deleted with its shift) → "no longer open"', async () => {
      swapsRead.mockResolvedValue([swapRecord('sw-other', 'pending_pr')]);
      const screen = await openBellOn([swapNotice]);
      await waitFor(() => expect(screen.queryByTestId('notif-opens')).toBeNull());

      await fireEvent.press(screen.getByText(EN.notif.swapRequestTitle));

      expect(mockSetTab).not.toHaveBeenCalled();
      expect(screen.getByText(EN.swaps.noLongerOpen)).toBeTruthy();
    });

    test('her requests could not be read → the notice is trusted, and To-do re-reads them', async () => {
      swapsRead.mockRejectedValue(new Error('offline'));
      const screen = await openBellOn([swapNotice]);
      await waitFor(() => expect(swapsRead).toHaveBeenCalled());

      await fireEvent.press(screen.getByText(EN.notif.swapRequestTitle));

      expect(mockSetTab).toHaveBeenCalledWith('shifts', {
        shiftsFocus: { section: 'todo', swapId: 'sw1' },
      });
      expect(screen.queryByText(EN.swaps.noLongerOpen)).toBeNull();
    });

    test('no swap notice in the bell → her swap requests are never read', async () => {
      const screen = await openBellOn([
        notice('n12', 'shift_assigned', 'You have a new shift', {
          assignmentId: 'as-booked',
          shiftDate: '2026-10-03',
        }),
      ]);
      expect(await screen.findByText(EN.notif.shiftAssignedTitle)).toBeTruthy();
      expect(swapsRead).not.toHaveBeenCalled();
    });
  });
});
