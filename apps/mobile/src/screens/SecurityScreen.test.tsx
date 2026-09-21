// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocaleProvider } from '../i18n';
import { saveLocale } from '../i18n/locale-prefs';
import { translations } from '../i18n/translations';
import {
  ApiError,
  confirmPasswordChange,
  resendPasswordChangeCode,
  startPasswordChange,
} from '../lib/api';
import { SecurityScreen } from './SecurityScreen';

/**
 * THE TWO-STEP PASSWORD CHANGE, as the PR actually meets it (owner, 21 Sep
 * 2026: "Current password + a code").
 *
 * This screen had no test at all while it was the one place a PR can change a
 * credential — so a green run said nothing about it. What is pinned here is
 * everything a typecheck cannot see: which call goes out with which fields,
 * that the new password does NOT travel with step 1, that a refusal lands on
 * the sheet that owns the field it names, and that the re-issued token is
 * adopted before anything else.
 *
 * ⚠️ The network is mocked — no code is ever sent from a test, and no password
 * is ever written. `ApiError` stays REAL (requireActual) because the screen
 * branches on `instanceof`.
 */

/*
 * The FIRST render in this file pays for the whole module graph (expo-constants,
 * the icon SVGs, the locale dictionary) and passes Jest's 5 s default on a cold
 * run — while every later test in the same file finishes in well under a
 * second. A per-suite budget, not a slow screen.
 */
jest.setTimeout(30_000);

jest.mock('../lib/pr-nav', () => ({
  usePrNav: () => ({ goBack: jest.fn() }),
}));

const mockAdoptToken = jest.fn();
const mockSignOut = jest.fn();
const mockRefreshMe = jest.fn(async () => undefined);

jest.mock('../lib/session', () => ({
  useSession: () => ({
    me: { id: 'user-1', phoneNum: '+60123456789', email: 'vicky@example.com' },
    token: 'session-token',
    signOut: mockSignOut,
    adoptToken: mockAdoptToken,
    refreshMe: mockRefreshMe,
  }),
}));

jest.mock('../lib/api', () => ({
  ...jest.requireActual('../lib/api'),
  startPasswordChange: jest.fn(),
  resendPasswordChangeCode: jest.fn(),
  confirmPasswordChange: jest.fn(),
  // Never reached by these tests, but mocked so a stray call cannot hit fetch.
  startContactChange: jest.fn(),
  resendContactChangeNewCode: jest.fn(),
  confirmContactChange: jest.fn(),
  deleteOwnAccount: jest.fn(),
}));

const start = startPasswordChange as jest.MockedFunction<typeof startPasswordChange>;
const resend = resendPasswordChangeCode as jest.MockedFunction<
  typeof resendPasswordChangeCode
>;
const confirm = confirmPasswordChange as jest.MockedFunction<typeof confirmPasswordChange>;

const EN = translations.en;
const REQUEST_ID = '00000000-0000-4000-8000-000000000000';

/** A start/resend answer: one code, on the phone and the email already on file. */
const SENT = {
  requestId: REQUEST_ID,
  sentTo: [
    { channel: 'whatsapp' as const, to: '+60 ••••• 6789', status: 'sent' as const },
    { channel: 'email' as const, to: 'v••••@example.com', status: 'sent' as const },
  ],
  expiresInSec: 600,
  resendAfterSec: 60,
};

/** A phone-sized frame with no notch — the screen reads safe-area insets. */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <LocaleProvider>
        <SecurityScreen />
      </LocaleProvider>
    </SafeAreaProvider>,
  );
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

/**
 * The boxes carry no placeholder and a secure one has no readable value, so
 * they are addressed by testID — WHICH box a password went into is precisely
 * what is being pinned.
 */
const CURRENT = 'security-current-password';
const NEXT = 'security-new-password';
const AGAIN = 'security-confirm-password';
const CODE = 'security-password-code';

/** Step 1, filled in and sent. Leaves the code sheet open. */
async function reachCodeSheet(
  screen: Screen,
  passwords = { current: 'old-password', next: 'new-password' },
) {
  await fireEvent.press(screen.getByText(EN.security.changePassword));
  await fireEvent.changeText(screen.getByTestId(CURRENT), passwords.current);
  await fireEvent.changeText(screen.getByTestId(NEXT), passwords.next);
  await fireEvent.changeText(screen.getByTestId(AGAIN), passwords.next);
  await fireEvent.press(screen.getByText(EN.security.sendOtp));
  return screen.findByText(EN.security.passwordCodeTitle);
}

beforeEach(() => {
  start.mockReset();
  resend.mockReset();
  confirm.mockReset();
  mockAdoptToken.mockReset();
  mockSignOut.mockReset();
  mockRefreshMe.mockReset();
  mockRefreshMe.mockResolvedValue(undefined);
  saveLocale('en');
});

describe('step 1 — the current password, and nothing written yet', () => {
  test('posts ONLY the current password, and moves to the code sheet', async () => {
    start.mockResolvedValue(SENT);
    const screen = await renderScreen();
    await reachCodeSheet(screen);

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('session-token', 'old-password');
    // The new password does not leave the device until the code comes back.
    expect(start.mock.calls[0]).toHaveLength(2);
    expect(confirm).not.toHaveBeenCalled();
    // Where the code went, from the server's own masked report.
    expect(screen.getByText(/\+60 ••••• 6789/)).toBeTruthy();
    expect(screen.getByText(/v••••@example\.com/)).toBeTruthy();
  });

  test.each([
    ['too short', 'short', 'short', EN.security.passwordMin],
    ['mismatched', 'new-password', 'new-passw0rd', EN.security.passwordMismatch],
    ['the current one', 'old-password', 'old-password', EN.errors.passwordMustDiffer],
  ])('a new password that is %s sends no code at all', async (_case, next, again, copy) => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByText(EN.security.changePassword));
    await fireEvent.changeText(screen.getByTestId(CURRENT), 'old-password');
    await fireEvent.changeText(screen.getByTestId(NEXT), next);
    await fireEvent.changeText(screen.getByTestId(AGAIN), again);
    await fireEvent.press(screen.getByText(EN.security.sendOtp));

    expect(await screen.findByText(copy)).toBeTruthy();
    // The whole point of checking here: no code row, no WhatsApp, no email.
    expect(start).not.toHaveBeenCalled();
  });

  test('a wrong current password is shown on this sheet, NOT taken as a dead session', async () => {
    // 400, never 401 — the server says so deliberately.
    start.mockRejectedValue(new ApiError('Current password is incorrect', 400));
    const screen = await renderScreen();
    await fireEvent.press(screen.getByText(EN.security.changePassword));
    await fireEvent.changeText(screen.getByTestId(CURRENT), 'wrong-one');
    await fireEvent.changeText(screen.getByTestId(NEXT), 'new-password');
    await fireEvent.changeText(screen.getByTestId(AGAIN), 'new-password');
    await fireEvent.press(screen.getByText(EN.security.sendOtp));

    expect(await screen.findByText(EN.errors.currentPasswordIncorrect)).toBeTruthy();
    expect(screen.queryByText(EN.security.passwordCodeTitle)).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  test('a refused SESSION (bare 401) sends her to sign in again, with nothing changed', async () => {
    start.mockRejectedValue(new ApiError('Unauthorized', 401));
    const screen = await renderScreen();
    await fireEvent.press(screen.getByText(EN.security.changePassword));
    await fireEvent.changeText(screen.getByTestId(CURRENT), 'old-password');
    await fireEvent.changeText(screen.getByTestId(NEXT), 'new-password');
    await fireEvent.changeText(screen.getByTestId(AGAIN), 'new-password');
    await fireEvent.press(screen.getByText(EN.security.sendOtp));

    expect(await screen.findByText(EN.security.sessionEnded)).toBeTruthy();
  });
});

describe('step 2 — the code and the new password together', () => {
  test('posts the requestId, the code and the NEW password, then adopts the token', async () => {
    start.mockResolvedValue(SENT);
    confirm.mockResolvedValue({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' });
    const screen = await renderScreen();
    await reachCodeSheet(screen);

    await fireEvent.changeText(screen.getByTestId(CODE), '123456');
    await fireEvent.press(screen.getByText(EN.security.verifyAndSave));

    expect(await screen.findByText(EN.security.passwordUpdated)).toBeTruthy();
    expect(confirm).toHaveBeenCalledWith('session-token', {
      requestId: REQUEST_ID,
      code: '123456',
      newPassword: 'new-password',
    });
    // Before anything else touches the API — the old token is dead by now.
    expect(mockAdoptToken).toHaveBeenCalledWith('fresh-access');
    expect(mockRefreshMe).toHaveBeenCalledWith('fresh-access');
  });

  test('an incomplete code is never sent', async () => {
    start.mockResolvedValue(SENT);
    const screen = await renderScreen();
    await reachCodeSheet(screen);

    await fireEvent.changeText(screen.getByTestId(CODE), '123');
    await fireEvent.press(screen.getByText(EN.security.verifyAndSave));
    expect(confirm).not.toHaveBeenCalled();
  });

  test('a wrong code stays on the code sheet and says so', async () => {
    start.mockResolvedValue(SENT);
    confirm.mockRejectedValue(new ApiError('Invalid code', 400));
    const screen = await renderScreen();
    await reachCodeSheet(screen);

    await fireEvent.changeText(screen.getByTestId(CODE), '000000');
    await fireEvent.press(screen.getByText(EN.security.verifyAndSave));

    expect(await screen.findByText(EN.errors.invalidCode)).toBeTruthy();
    expect(screen.getByText(EN.security.passwordCodeTitle)).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockAdoptToken).not.toHaveBeenCalled();
  });

  test('"New password must be different" sends her back to the sheet that owns the field', async () => {
    /*
     * It can only be answered HERE: confirm carries no current password, so the
     * server compares the new one against the stored hash. The field it names
     * lives on step 1, so that is where she must land.
     */
    start.mockResolvedValue(SENT);
    confirm.mockRejectedValue(new ApiError('New password must be different', 400));
    const screen = await renderScreen();
    await reachCodeSheet(screen);

    await fireEvent.changeText(screen.getByTestId(CODE), '123456');
    await fireEvent.press(screen.getByText(EN.security.verifyAndSave));

    expect(await screen.findByText(EN.errors.passwordMustDiffer)).toBeTruthy();
    expect(screen.getByText(EN.security.changePasswordHint)).toBeTruthy();
    expect(screen.queryByText(EN.security.passwordCodeTitle)).toBeNull();
  });

  test('a change with no fresh token still counts as changed — sign in again', async () => {
    start.mockResolvedValue(SENT);
    confirm.mockResolvedValue({ accessToken: null, refreshToken: null });
    const screen = await renderScreen();
    await reachCodeSheet(screen);

    await fireEvent.changeText(screen.getByTestId(CODE), '123456');
    await fireEvent.press(screen.getByText(EN.security.verifyAndSave));

    // The saved-and-signed-out sheet, not an error.
    expect(await screen.findByText(EN.security.signInAgainBody)).toBeTruthy();
    expect(screen.getByText(EN.security.passwordUpdated)).toBeTruthy();
    expect(mockAdoptToken).not.toHaveBeenCalled();
  });
});

describe('resend — the new requestId replaces the one we hold', () => {
  test('confirm then carries the REISSUED id, never the first one', async () => {
    const REISSUED = '11111111-1111-4111-8111-111111111111';
    // resendAfterSec 0 so the countdown does not hold the button down.
    start.mockResolvedValue({ ...SENT, resendAfterSec: 0 });
    resend.mockResolvedValue({ ...SENT, requestId: REISSUED, resendAfterSec: 0 });
    confirm.mockResolvedValue({ accessToken: 'fresh-access', refreshToken: 'fresh' });
    const screen = await renderScreen();
    await reachCodeSheet(screen);

    await fireEvent.press(screen.getByText(EN.forgot.resend));
    expect(resend).toHaveBeenCalledWith('session-token', { requestId: REQUEST_ID });

    await fireEvent.changeText(screen.getByTestId(CODE), '654321');
    await fireEvent.press(screen.getByText(EN.security.verifyAndSave));

    expect(await screen.findByText(EN.security.passwordUpdated)).toBeTruthy();
    expect(confirm).toHaveBeenCalledWith('session-token', {
      requestId: REISSUED,
      code: '654321',
      newPassword: 'new-password',
    });
  });
});
