// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { CallTranscript } from './TestCall';
import type { useTestCall } from './use-test-call';

const call: ReturnType<typeof useTestCall> = {
  identity: null, status: 'connected', active: true, error: '', start: vi.fn(), stop: vi.fn(),
  transcript: [{ role: 'assistant', text: 'Hello', segment: 1 }],
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('follows segment growth, preserves reading position, and resumes on request', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const { rerender } = render(<CallTranscript call={call} />);
  const log = screen.getByRole('log');
  Object.defineProperties(log, { scrollHeight: { configurable: true, value: 900 }, clientHeight: { value: 300 } });
  const growing = { ...call, transcript: [{ role: 'assistant' as const, text: 'Hello, how can I help?', segment: 1 }] };
  rerender(<CallTranscript call={growing} />);
  expect(log.scrollTop).toBe(900);
  log.scrollTop = 100;
  fireEvent.scroll(log);
  rerender(<CallTranscript call={{ ...growing, transcript: [...growing.transcript, { role: 'user', text: 'An appointment.' }] }} />);
  expect(log.scrollTop).toBe(100);
  fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));
  expect(log.scrollTop).toBe(900);
  expect(screen.queryByRole('button', { name: 'Jump to latest' })).not.toBeInTheDocument();
});

test('resumes following for a new call and when the hidden pane becomes visible', () => {
  let resize = () => {};
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  const { rerender } = render(<CallTranscript call={call} />);
  const log = screen.getByRole('log');
  Object.defineProperties(log, { scrollHeight: { value: 900 }, clientHeight: { value: 300 } });
  log.scrollTop = 100;
  fireEvent.scroll(log);
  resize();
  expect(log.scrollTop).toBe(100);
  rerender(<CallTranscript call={{ ...call, transcript: [] }} />);
  rerender(<CallTranscript call={call} />);
  expect(log.scrollTop).toBe(900);
  log.scrollTop = 0;
  resize();
  expect(log.scrollTop).toBe(900);
});
