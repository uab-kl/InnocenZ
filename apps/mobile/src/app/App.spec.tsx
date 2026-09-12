import * as React from 'react';
import { render } from '@testing-library/react-native';

import App from './App';

/*
 * ⚠️ THE TIMEOUT IS THE POINT — this test was FLAKY, not broken.
 *
 * It mounts the WHOLE app: fonts, safe-area, the session provider and the
 * navigator. Under `npx jest` that runs beside three other suites and regularly
 * crossed Jest's default 5000 ms, so it failed roughly one run in three while
 * passing every time it was run alone — the signature that reads as "the app is
 * broken" and is nothing of the kind.
 *
 * 30s is a ceiling for a hung mount, not a target: a healthy run finishes in
 * about 7s. Raising it removes the false alarm without hiding a real hang.
 */
test(
  'renders the PR sign-in screen',
  async () => {
    const { getByText } = await render(<App />);
    expect(getByText('InnocenZ')).toBeTruthy();
    expect(getByText('Welcome back')).toBeTruthy();
  },
  30_000,
);
