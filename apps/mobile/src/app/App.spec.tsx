import * as React from 'react';
import { render } from '@testing-library/react-native';

import App from './App';

test('renders correctly', async () => {
  const { getByTestId } = await render(<App />);
  expect(getByTestId('heading')).toHaveTextContent(/Welcome/);
});
