// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import Home from './page';

afterEach(cleanup);

test('renders the accessible application shell', () => {
  render(<Home />);
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Prosper Agent Builder' })).toBeVisible();
});
