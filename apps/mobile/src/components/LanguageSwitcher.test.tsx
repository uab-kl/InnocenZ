// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import * as React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { LocaleProvider } from '../i18n';
import { saveLocale } from '../i18n/locale-prefs';
import { translations } from '../i18n/translations';
import { LanguageSwitcher } from './LanguageSwitcher';

/*
 * The language sheet opened OUTSIDE the phone frame on the web build (28 Sep
 * 2026 audit): a bare RN Modal portals to the browser's <body>. It now goes
 * through PhoneSheet like every other in-frame sheet — into the phone screen
 * element on web, a real Modal on a phone.
 */

/*
 * Each render here is quick alone, but a parallel `nx run-many` slowed this
 * file to 40 s and one test past Jest's 5 s default (29 Sep 2026). Same
 * per-suite budget as SecurityScreen.test.tsx and TopBar.test.tsx.
 */
jest.setTimeout(30_000);

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: jest.fn((node: unknown) => node),
}));

const EN = translations.en;

beforeEach(() => {
  saveLocale('en');
});

async function openSheet() {
  const screen = await render(
    <LocaleProvider>
      <LanguageSwitcher compact />
    </LocaleProvider>,
  );
  await fireEvent.press(screen.getByLabelText(EN.lang.language));
  return screen;
}

describe('LanguageSwitcher sheet', () => {
  test('web: the sheet is portalled into the phone screen, not the browser window', async () => {
    const { createPortal } = jest.requireMock('react-dom') as { createPortal: jest.Mock };
    createPortal.mockClear();
    const host = { id: 'iz-phone-screen' };
    const doc = globalThis as { document?: unknown };
    const savedDocument = doc.document;
    const savedOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
    doc.document = { getElementById: (id: string) => (id === 'iz-phone-screen' ? host : null) };
    try {
      const screen = await openSheet();
      expect(screen.getByText(EN.lang.english)).toBeTruthy();
      expect(createPortal).toHaveBeenCalledWith(expect.anything(), host);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => savedOs });
      doc.document = savedDocument;
    }
  });

  test('a phone keeps the native Modal — nothing is portalled', async () => {
    const { createPortal } = jest.requireMock('react-dom') as { createPortal: jest.Mock };
    createPortal.mockClear();
    const screen = await openSheet();
    expect(screen.getByText(EN.lang.chineseTraditional)).toBeTruthy();
    expect(createPortal).not.toHaveBeenCalled();
  });
});
