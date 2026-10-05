// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ChatPresentation } from './ChatPresentation';

afterEach(cleanup);

function setup(status: 'idle' | 'streaming' | 'error' = 'idle') {
  const onSend = vi.fn(); const onStop = vi.fn(); const onRetry = vi.fn();
  render(<ChatPresentation messages={[]} status={status} onSend={onSend} onStop={onStop} onRetry={onRetry} />);
  return { onSend, onStop, onRetry };
}

test('rejects blank submission; trims input; preserves Shift+Enter and composing input', () => {
  const { onSend } = setup();
  const draft = screen.getByLabelText('Message Copilot');
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  fireEvent.change(draft, { target: { value: '  A change  ' } });
  fireEvent.keyDown(draft, { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(draft, { key: 'Enter', isComposing: true });
  expect(onSend).not.toHaveBeenCalled();
  fireEvent.keyDown(draft, { key: 'Enter' });
  expect(onSend).toHaveBeenCalledExactlyOnceWith('A change');
  expect(draft).toHaveValue('');
});

test('streaming blocks send, keeps draft, and exposes Stop', () => {
  const { onSend, onStop } = setup('streaming');
  fireEvent.change(screen.getByLabelText('Message Copilot'), { target: { value: 'Next question' } });
  fireEvent.keyDown(screen.getByLabelText('Message Copilot'), { key: 'Enter' });
  expect(onSend).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Message Copilot')).toHaveValue('Next question');
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(onStop).toHaveBeenCalledOnce();
});

test('error has actionable recovery', () => {
  const { onRetry } = setup('error');
  expect(screen.getByRole('status')).toHaveTextContent('Couldn’t complete');
  fireEvent.click(screen.getByRole('button', { name: 'Retry response' }));
  expect(onRetry).toHaveBeenCalledOnce();
});

test('renders safe Markdown without remote images and handles clipboard failure', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
  render(<ChatPresentation messages={[{ id: 'a', role: 'assistant', text: '**Review**\n\n<script>alert(1)</script>\n\n![sample](https://example.com/a.png)\n\n[bad](javascript:alert(1))' }]} status="complete" onSend={vi.fn()} onStop={vi.fn()} onRetry={vi.fn()} />);
  expect(screen.getByText('Review').tagName).toBe('STRONG');
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('img')).toBeNull();
  expect(screen.getByText('bad')).not.toHaveAttribute('href', 'javascript:alert(1)');
  fireEvent.click(screen.getByRole('button', { name: 'Copy response' }));
  await waitFor(() => expect(screen.getByText('Couldn’t copy. Select and copy the text instead.')).toBeVisible());
});
