// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import * as React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocaleProvider } from '../i18n';
import { translations } from '../i18n/translations';
import { LoginScreen } from './LoginScreen';

/**
 * THE SENTENCE SIGN-UP HANDS TO SIGN-IN (30 Sep 2026). When a sign-up creates
 * the account but the sign-in straight after it fails, the PR is sent here
 * with "Your account is ready…" — retrying the wizard could only spend a fresh
 * code to be told her number already has an account. Nothing is sent: the
 * session is mocked and no button is pressed.
 */

jest.setTimeout(30_000);

jest.mock('../lib/session', () => ({
  useSession: () => ({ signIn: jest.fn() }),
}));

const EN = translations.en;

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// `render` is async in this version of the library — awaited, as SecurityScreen.test does.
async function renderLogin(notice?: string | null) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <LocaleProvider>
        <LoginScreen notice={notice} />
      </LocaleProvider>
    </SafeAreaProvider>,
  );
}

describe('LoginScreen — a notice handed over by sign-up', () => {
  test('shows the account-ready sentence above the form', async () => {
    const screen = await renderLogin(EN.signup.accountReadySignIn);
    expect(await screen.findByText(EN.signup.accountReadySignIn)).toBeTruthy();
  });

  test('shows nothing extra when there is no notice', async () => {
    const screen = await renderLogin(null);
    await screen.findByText(EN.login.title);
    expect(screen.queryByText(EN.signup.accountReadySignIn)).toBeNull();
  });
});
