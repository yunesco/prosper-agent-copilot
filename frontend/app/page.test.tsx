// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { STORAGE_KEY } from '@/lib/agent/repository';
import { loadAgentFixture } from '@/lib/fixtures';
import Home from './page';

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

test('renders the accessible application shell', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, selectedId: 'original', agents: [{ id: 'original', revision: 1, guidelines: '', agent: loadAgentFixture('original-scheduler') }] }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  render(<Home />);
  expect(await screen.findByRole('button', { name: 'Test Call' })).toBeEnabled();
  expect(screen.getByRole('textbox', { name: 'Agent name' })).toHaveValue('Prosper Scheduler');
  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Prosper Scheduler' })).toBeVisible();
});
