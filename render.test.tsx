// @vitest-environment jsdom
import { render } from '@testing-library/react';
import React from 'react';
import App from './src/App';
import { test, expect } from 'vitest';

test('renders App without crashing', () => {
  const { container } = render(<App />);
  expect(container.textContent).toContain('Choose your school');
});
