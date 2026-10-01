// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocaleProvider } from '../i18n';
import { saveLocale } from '../i18n/locale-prefs';
import { translations } from '../i18n/translations';
import { PvDetailScreen } from './PvDetailScreen';

/*
 * PV DETAIL SHOWED LAST WEEK'S VOUCHER FOR AN ID IT COULD NOT FIND (29 Sep
 * 2026). A stale link — a notice about a voucher since replaced — opened a
 * DIFFERENT document, headed with its number and carrying a live Sign button.
 * Rendered for real with the voucher sources mocked; nothing reaches a server.
 * The rule itself is pinned in lib/pv-lookup.test.ts.
 */
jest.setTimeout(30_000);

jest.mock('../lib/api', () => ({
  ...jest.requireActual('../lib/api'),
  signMyVoucher: jest.fn(),
}));
jest.mock('../lib/session', () => ({
  useSession: () => ({ token: 'A1', me: { id: 'u1', username: 'vicky' } }),
}));
const mockGoBack = jest.fn();
jest.mock('../lib/pr-nav', () => ({
  usePrNav: () => ({ goBack: mockGoBack, setTab: jest.fn() }),
}));
jest.mock('../lib/signed-pv', () => ({
  useSignedPvs: () => ({ isSigned: () => false, signPv: jest.fn() }),
}));
jest.mock('../lib/use-keyboard-inset', () => ({ useKeyboardInset: () => 0 }));

/** What each voucher source answers — set per test. */
const mockSources = {
  history: {
    vouchers: [] as unknown[],
    weeks: [] as unknown[],
    loading: false,
    loaded: true,
    error: null as string | null,
    refresh: jest.fn(async () => undefined),
  },
  lastWeek: {
    lastWeek: null as unknown,
    loaded: true,
    failed: false,
    refresh: jest.fn(async () => undefined),
  },
};
jest.mock('../lib/payment-history', () => ({ usePaymentHistory: () => mockSources.history }));
jest.mock('../lib/awaiting-pv', () => ({
  useAwaitingLastWeekPv: () => ({ awaiting: null, awaitingAll: [], ...mockSources.lastWeek }),
}));

const EN = translations.en;
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Last week: ONE voucher, sent and waiting for her signature. */
const LAST_WEEK = {
  voucherId: 'pv-lw',
  voucherNo: 'PV-000009',
  weekStart: '2026-09-21',
  weekEnd: '2026-09-27',
  net: '480.00',
  status: 'sent',
  lines: [],
  vouchers: [
    { id: 'pv-lw', voucherNo: 'PV-000009', agencyName: 'Atlas', net: '480.00', status: 'sent' },
  ],
};

async function renderPv(pvId: string) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <LocaleProvider>
        <PvDetailScreen pvId={pvId} />
      </LocaleProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  saveLocale('en');
  mockGoBack.mockReset();
  mockSources.history.loaded = true;
  mockSources.history.error = null;
  mockSources.history.refresh.mockClear();
  mockSources.lastWeek.lastWeek = LAST_WEEK;
  mockSources.lastWeek.loaded = true;
  mockSources.lastWeek.failed = false;
  mockSources.lastWeek.refresh.mockClear();
});

describe('PV detail opened with an id', () => {
  test("THE BUG: an id nobody holds says NOT FOUND — never last week's voucher and its Sign button", async () => {
    const screen = await renderPv('pv-replaced');

    expect(screen.getByText(EN.pv.notFoundTitle)).toBeTruthy();
    expect(screen.getByText(EN.pv.notFoundBody)).toBeTruthy();
    expect(screen.queryByText(/PV-000009/)).toBeNull();
    expect(screen.queryByText(EN.pv.signVoucher)).toBeNull();

    await fireEvent.press(screen.getByText(EN.common.back));
    expect(mockGoBack).toHaveBeenCalled();
  });

  test('the voucher it WAS opened with still renders as before', async () => {
    const screen = await renderPv('pv-lw');

    expect(screen.getByText('Atlas · PV-000009')).toBeTruthy();
    expect(screen.queryByText(EN.pv.notFoundTitle)).toBeNull();
  });

  test('while a list has not answered, it says loading — and claims nothing', async () => {
    mockSources.history.loaded = false;
    const screen = await renderPv('pv-replaced');

    expect(screen.getByText(EN.pv.loadingVoucher)).toBeTruthy();
    expect(screen.queryByText(EN.pv.notFoundTitle)).toBeNull();
    expect(screen.queryByText(/PV-000009/)).toBeNull();
  });

  test('a list that FAILED cannot prove absence — it offers a retry of both reads', async () => {
    mockSources.history.error = 'offline';
    const screen = await renderPv('pv-replaced');

    expect(screen.getByText(EN.pv.loadFailedTitle)).toBeTruthy();
    expect(screen.queryByText(EN.pv.notFoundTitle)).toBeNull();

    await fireEvent.press(screen.getByText(EN.common.retry));
    expect(mockSources.history.refresh).toHaveBeenCalled();
    expect(mockSources.lastWeek.refresh).toHaveBeenCalled();
  });
});
