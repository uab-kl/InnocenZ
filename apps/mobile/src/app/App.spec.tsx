import * as React from 'react';
import { render } from '@testing-library/react-native';

import App from './App';

test('renders the PR sign-in screen', async () => {
  const { getByText } = await render(<App />);
  expect(getByText('PR sign in')).toBeTruthy();
});
