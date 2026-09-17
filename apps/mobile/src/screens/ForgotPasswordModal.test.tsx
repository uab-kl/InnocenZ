// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import * as React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocaleProvider } from '../i18n';
import { saveLocale } from '../i18n/locale-prefs';
import { translations } from '../i18n/translations';
import { ApiError, completeForgotPassword, startForgotPassword } from '../lib/api';
import { ForgotPasswordModal } from './ForgotPasswordModal';

/*
 * The network is mocked — no code is ever sent from a test. Everything else
 * (the switch, normalisation, the step change, the localised refusal) is the
 * real sheet.
 */
jest.mock('../lib/api', () => ({
  ...jest.requireActual('../lib/api'),
  startForgotPassword: jest.fn(),
  completeForgotPassword: jest.fn(),
}));

const start = startForgotPassword as jest.MockedFunction<typeof startForgotPassword>;
const complete = completeForgotPassword as jest.MockedFunction<typeof completeForgotPassword>;

const EN = translations.en;
const NEUTRAL = { requestId: '00000000-0000-4000-8000-000000000000', expiresInSec: 600, resendAfterSec: 60 };

/** The dial-code Picker reads safe-area insets; a phone-sized frame with no notch. */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderSheet() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <LocaleProvider>
        <ForgotPasswordModal visible onClose={jest.fn()} initialCountryCode="MY" initialLocalNumber="" />
      </LocaleProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  start.mockReset();
  complete.mockReset();
  saveLocale('en');
});

describe('ForgotPasswordModal — Phone / Email switch', () => {
  test('opens on Phone, with the dial-code field', async () => {
    const screen = await renderSheet();
    expect(screen.getByText(EN.forgot.phoneHint)).toBeTruthy();
    expect(screen.getByText(EN.login.mobileNumber)).toBeTruthy();
    expect(screen.queryByText(EN.forgot.emailHint)).toBeNull();
  });

  test('Phone sends { phoneNum } as +digits and moves to the code step', async () => {
    start.mockResolvedValue(NEUTRAL);
    const screen = await renderSheet();
    await fireEvent.changeText(screen.getByPlaceholderText('123456789'), '012-345 6789');
    await fireEvent.press(screen.getByText(EN.forgot.sendCode));
    expect(await screen.findByText(EN.forgot.otpTitle)).toBeTruthy();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({ phoneNum: '+60123456789' });
  });

  test('Email sends { email } trimmed and lowercased', async () => {
    start.mockResolvedValue(NEUTRAL);
    const screen = await renderSheet();
    await fireEvent.press(screen.getByText(EN.forgot.byEmail));
    expect(screen.getByText(EN.forgot.emailHint)).toBeTruthy();
    expect(screen.queryByText(EN.login.mobileNumber)).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), '  Someone@Example.COM ');
    await fireEvent.press(screen.getByText(EN.forgot.sendCode));
    expect(await screen.findByText(EN.forgot.otpTitle)).toBeTruthy();
    expect(start).toHaveBeenCalledWith({ email: 'someone@example.com' });
  });

  test('an email that cannot be an address is explained, and nothing is sent', async () => {
    const screen = await renderSheet();
    await fireEvent.press(screen.getByText(EN.forgot.byEmail));
    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'someone');
    await fireEvent.press(screen.getByText(EN.forgot.sendCode));
    expect(await screen.findByText(EN.errors.invalidEmailAddress)).toBeTruthy();
    expect(start).not.toHaveBeenCalled();
  });

  test('switching back to Phone clears the email error', async () => {
    const screen = await renderSheet();
    await fireEvent.press(screen.getByText(EN.forgot.byEmail));
    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'someone');
    await fireEvent.press(screen.getByText(EN.forgot.sendCode));
    expect(await screen.findByText(EN.errors.invalidEmailAddress)).toBeTruthy();
    await fireEvent.press(screen.getByText(EN.forgot.byPhone));
    expect(screen.queryByText(EN.errors.invalidEmailAddress)).toBeNull();
    expect(screen.getByText(EN.forgot.phoneHint)).toBeTruthy();
  });
});

describe('ForgotPasswordModal — server refusals in the reader’s language', () => {
  test('a 500 reads in Chinese on a 中文 session', async () => {
    saveLocale('zh');
    start.mockRejectedValue(new ApiError('Internal Server Error', 500));
    const screen = await renderSheet();
    await fireEvent.changeText(screen.getByPlaceholderText('123456789'), '123456789');
    await fireEvent.press(screen.getByText(translations.zh.forgot.sendCode));
    expect(await screen.findByText(translations.zh.errors.internalServerError)).toBeTruthy();
    expect(screen.queryByText('Internal Server Error')).toBeNull();
  });

  test('the server’s password bound keeps its number in Traditional Chinese', async () => {
    saveLocale('zh-Hant');
    const ZH_HANT = translations['zh-Hant'];
    start.mockResolvedValue(NEUTRAL);
    complete.mockRejectedValue(new ApiError('Password must be at most 72 characters long', 400));
    const screen = await renderSheet();
    await fireEvent.changeText(screen.getByPlaceholderText('123456789'), '123456789');
    await fireEvent.press(screen.getByText(ZH_HANT.forgot.sendCode));
    await fireEvent.changeText(await screen.findByPlaceholderText('123456'), '123456');
    await fireEvent.press(screen.getByText(ZH_HANT.common.continue));
    const [password, confirm] = screen.getAllByDisplayValue('');
    await fireEvent.changeText(password, 'secret-1');
    await fireEvent.changeText(confirm, 'secret-1');
    await fireEvent.press(screen.getByText(ZH_HANT.forgot.setPassword));
    expect(await screen.findByText('密碼最多 72 位')).toBeTruthy();
    // Not a code refusal: she stays on the password step with her code intact.
    expect(screen.getByText(ZH_HANT.forgot.setPassword)).toBeTruthy();
  });
});
