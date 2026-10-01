// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import * as React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocaleProvider } from '../i18n';
import { saveLocale } from '../i18n/locale-prefs';
import { translations } from '../i18n/translations';
import type { OutletSwapRecord, ShiftAssignmentRecord } from '../lib/api';
import type { PrRoute } from '../lib/pr-nav';
import { ShiftsScreen } from './ShiftsScreen';

/*
 * A NOTIFICATION'S SHIFT, OPENED (29 Sep 2026). The bell hands Shifts a focus
 * (TopBar → notification-targets); this pins that the PR then SEES the item —
 * the day's sheet on the Agency Schedule, read after a fresh re-read of the
 * assignments — or, for a swap request, the To-do section it is answered in.
 * The network is mocked; nothing is read from or written to a server.
 */

jest.setTimeout(30_000);

const mockNav: { route: PrRoute } = { route: { name: 'tabs', tab: 'shifts' } };
const mockRefresh = jest.fn(async () => undefined);
const mockSwapRefresh = jest.fn(async () => undefined);
const mockShifts: { rows: ShiftAssignmentRecord[] } = { rows: [] };
/** The swap requests still waiting for her answer, as To-do reads them. */
const mockSwaps: { pending: OutletSwapRecord[] } = { pending: [] };

jest.mock('../lib/pr-nav', () => ({
  usePrNav: () => ({ openPv: jest.fn(), route: mockNav.route }),
}));
jest.mock('../lib/session', () => ({
  useSession: () => ({
    me: { id: 'u1', username: 'vicky', profile: { firstName: 'Vicky' } },
    agencies: [],
    token: 'A1',
  }),
}));
jest.mock('../lib/active-shift', () => ({
  useActiveShift: () => ({ assignments: mockShifts.rows, refresh: mockRefresh, focus: jest.fn() }),
}));
jest.mock('../lib/outlet-swaps', () => ({
  useOutletSwaps: () => ({
    pending: mockSwaps.pending,
    loading: false,
    error: null,
    actionError: null,
    travelWarning: null,
    busyId: null,
    respond: jest.fn(),
    refresh: mockSwapRefresh,
  }),
}));
jest.mock('../lib/awaiting-pv', () => ({ useAwaitingLastWeekPv: () => ({ awaiting: null }) }));
jest.mock('../lib/use-penalty-rules', () => ({ useMyPenaltyRules: () => null }));
jest.mock('../lib/api', () => ({
  ...jest.requireActual('../lib/api'),
  // Read on mount by the schedule; every write it could make is stubbed so a
  // stray tap cannot reach fetch.
  fetchMyUnavailableDays: jest.fn(async () => []),
  blockMyDay: jest.fn(),
  unblockMyDay: jest.fn(),
  cancelMyShiftAssignment: jest.fn(),
  requestMyShiftLeave: jest.fn(),
}));

const EN = translations.en;
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Far enough ahead that neither Today nor this week's timetable lists it. */
const DAY = '2027-01-15';

function assignment(over: Partial<ShiftAssignmentRecord>): ShiftAssignmentRecord {
  return {
    id: 'as-1',
    status: 'assigned',
    payAmount: '0.00',
    notes: null,
    leaveProofPhotos: null,
    checkInAt: null,
    checkOutAt: null,
    dayRateAmount: null,
    workedMinutes: null,
    scheduledMinutes: null,
    payRule: null,
    shiftDate: DAY,
    slot: '20:00 - 02:00',
    eventName: null,
    eventKind: 'normal',
    payPerHour: '0.00',
    outletName: 'Velvet Lounge',
    outletAddress: '1 Jalan Test',
    outletLat: null,
    outletLng: null,
    outletGeoFenceRadiusM: 100,
    agencyId: 'ag-atlas',
    agencyName: 'Atlas',
    tier: 'tier_5',
    rate: null,
    drinkMenu: [],
    ...over,
  };
}

async function renderShifts(route: PrRoute) {
  mockNav.route = route;
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <LocaleProvider>
        <ShiftsScreen onNavigate={jest.fn()} />
      </LocaleProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  saveLocale('en');
  mockRefresh.mockClear();
  mockSwapRefresh.mockClear();
  mockSwaps.pending = [];
  mockShifts.rows = [
    assignment({ id: 'as-booked' }),
    assignment({ id: 'as-cancelled', status: 'cancelled', outletName: 'Atlas Rooftop', slot: '18:00 - 22:00' }),
  ];
});

describe('Shifts opened from a notification', () => {
  test("a shift's day opens on the Agency Schedule — every booking on it, with what happened", async () => {
    const screen = await renderShifts({
      name: 'tabs',
      tab: 'shifts',
      shiftsFocus: { section: 'schedule', dateIso: DAY },
    });

    expect(await screen.findByText(EN.schedule.shiftsThisDay)).toBeTruthy();
    expect(screen.getByText('Velvet Lounge')).toBeTruthy();
    expect(screen.getByText(EN.schedule.outcomeNotStarted)).toBeTruthy();
    // A cancelled booking is still THERE, and says so — which is where a
    // "shift cancelled" notification lands.
    expect(screen.getByText('Atlas Rooftop')).toBeTruthy();
    expect(screen.getByText(EN.schedule.outcomeCancelled)).toBeTruthy();
    // Re-read before opening: the notification is newer than the list.
    expect(mockRefresh.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('a plain visit to Shifts opens no sheet', async () => {
    const screen = await renderShifts({ name: 'tabs', tab: 'shifts' });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(screen.queryByText(EN.schedule.shiftsThisDay)).toBeNull();
  });

  test('a booking REMOVED since its notice: the day opens and SAYS so — not a bare month', async () => {
    // It used to turn the calendar and open nothing, which read as "the app
    // lost my shift".
    const screen = await renderShifts({
      name: 'tabs',
      tab: 'shifts',
      shiftsFocus: { section: 'schedule', dateIso: '2027-02-20', assignmentId: 'as-removed' },
    });
    expect(await screen.findByText(EN.schedule.shiftNoLongerOnSchedule)).toBeTruthy();
    expect(screen.getByText(EN.schedule.shiftsThisDay)).toBeTruthy();
    expect(await screen.findByText(EN.schedule.monLongFeb)).toBeTruthy();
    // Said after the re-read, never off the stale list.
    expect(mockRefresh.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('removed, on a day that still holds ANOTHER shift: the notice, then what is still there', async () => {
    const screen = await renderShifts({
      name: 'tabs',
      tab: 'shifts',
      shiftsFocus: { section: 'schedule', dateIso: DAY, assignmentId: 'as-removed' },
    });
    expect(await screen.findByText(EN.schedule.shiftNoLongerOnSchedule)).toBeTruthy();
    // The other booking does not stand in for the one that went.
    expect(screen.getByText('Velvet Lounge')).toBeTruthy();
  });

  test('a booking that IS still there opens its day with no such notice', async () => {
    const screen = await renderShifts({
      name: 'tabs',
      tab: 'shifts',
      shiftsFocus: { section: 'schedule', dateIso: DAY, assignmentId: 'as-booked' },
    });
    expect(await screen.findByText(EN.schedule.shiftsThisDay)).toBeTruthy();
    expect(screen.queryByText(EN.schedule.shiftNoLongerOnSchedule)).toBeNull();
  });

  test("the day's sheet names WHICH special night — not a bare \"Special event\"", async () => {
    mockShifts.rows = [
      assignment({
        id: 'as-vip',
        eventName: 'Launch party',
        eventKind: 'special',
        specialEventType: 'vip',
      }),
    ];
    const screen = await renderShifts({
      name: 'tabs',
      tab: 'shifts',
      shiftsFocus: { section: 'schedule', dateIso: DAY, assignmentId: 'as-vip' },
    });
    expect(await screen.findByText('Launch party · Special event · VIP night')).toBeTruthy();
  });

  test('coming BACK to the same route (e.g. from a voucher) does not reopen the sheet', async () => {
    // The nav stack hands the same route object back; its focus was spent.
    const route: PrRoute = {
      name: 'tabs',
      tab: 'shifts',
      shiftsFocus: { section: 'schedule', dateIso: DAY },
    };
    const first = await renderShifts(route);
    expect(await first.findByText(EN.schedule.shiftsThisDay)).toBeTruthy();
    await first.unmount();

    mockRefresh.mockClear();
    const again = await renderShifts(route);
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(again.queryByText(EN.schedule.shiftsThisDay)).toBeNull();
  });

  test('folding and reopening the Agency Schedule does not pop the sheet back open', async () => {
    const screen = await renderShifts({
      name: 'tabs',
      tab: 'shifts',
      shiftsFocus: { section: 'schedule', dateIso: DAY },
    });
    expect(await screen.findByText(EN.schedule.shiftsThisDay)).toBeTruthy();
    const header = EN.shifts.agencySchedule.toUpperCase();
    await fireEvent.press(screen.getByText(header)); // fold — the panel unmounts
    expect(screen.queryByText(EN.schedule.shiftsThisDay)).toBeNull();
    await fireEvent.press(screen.getByText(header)); // reopen — same focus handed down
    expect(screen.queryByText(EN.schedule.shiftsThisDay)).toBeNull();
  });

  test('a swap request opens To-do, re-read, where it is answered', async () => {
    const screen = await renderShifts({
      name: 'tabs',
      tab: 'shifts',
      shiftsFocus: { section: 'todo' },
    });
    // To-do starts folded; the focus opens it.
    expect(await screen.findByText(EN.shifts.nothingToDo)).toBeTruthy();
    expect(mockSwapRefresh).toHaveBeenCalled();
  });

  test('a swap request no longer waiting (answered before the tap) says so on To-do', async () => {
    // The bell keeps such a notice when it KNOWS; this is the one it could not
    // know about yet — To-do must not just read "Nothing to do".
    const screen = await renderShifts({
      name: 'tabs',
      tab: 'shifts',
      shiftsFocus: { section: 'todo', swapId: 'sw-answered' },
    });
    expect(await screen.findByText(EN.swaps.noLongerOpen)).toBeTruthy();
    expect(mockSwapRefresh).toHaveBeenCalled();
  });

  test('a swap request still waiting shows no such notice', async () => {
    mockSwaps.pending = [
      {
        id: 'sw-open',
        assignmentId: 'as-booked',
        status: 'pending_pr',
        agencyNote: null,
        prNote: null,
        respondedAt: null,
        createdAt: '2026-09-29T02:00:00.000Z',
        fromOutletName: 'Velvet Lounge',
        fromSlot: '20:00 - 02:00',
        toOutletName: 'Atlas Rooftop',
        toSlot: '20:00 - 02:00',
        toEventName: null,
        toShiftDate: DAY,
      },
    ];
    const screen = await renderShifts({
      name: 'tabs',
      tab: 'shifts',
      shiftsFocus: { section: 'todo', swapId: 'sw-open' },
    });
    await waitFor(() => expect(mockSwapRefresh).toHaveBeenCalled());
    expect(screen.queryByText(EN.swaps.noLongerOpen)).toBeNull();
  });
});

describe('the Today card names WHICH special night', () => {
  test('"Launch party · Special event · VIP night" — and the event card\'s name when the shift has none of its own', async () => {
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    mockShifts.rows = [
      assignment({
        id: 'as-vip',
        shiftDate: today,
        slot: '20:00 - 23:00',
        eventName: 'Launch party',
        eventKind: 'special',
        specialEventType: 'vip',
      }),
      assignment({
        id: 'as-gin',
        shiftDate: today,
        slot: '23:30 - 23:50',
        eventName: 'Late set',
        eventKind: 'special',
        // Posted before 0167: only the event card knows which night.
        templateSpecialEventType: 'other',
        templateCustomEventName: 'Gin night',
      }),
    ];
    const screen = await renderShifts({ name: 'tabs', tab: 'shifts' });
    // Each is described twice on this screen — the Today card and this week's
    // timetable card — and both name the night.
    expect(await screen.findAllByText('Launch party · Special event · VIP night')).toHaveLength(2);
    expect(screen.getAllByText('Late set · Special event · Gin night')).toHaveLength(2);
    expect(screen.queryByText('Launch party · Special event')).toBeNull();
  });
});
