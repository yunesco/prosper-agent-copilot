// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ChatPresentation } from './ChatPresentation';

afterEach(cleanup);

function setup(status: 'idle' | 'streaming' | 'error' = 'idle') {
  const onSend = vi.fn();
  const onStop = vi.fn();
  const onRetry = vi.fn();
  render(
    <ChatPresentation messages={[]} status={status} onSend={onSend} onStop={onStop} onRetry={onRetry} />,
  );
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
  render(
    <ChatPresentation
      messages={[
        {
          id: 'a',
          role: 'assistant',
          text: '**Review**\n\n<script>alert(1)</script>\n\n![sample](https://example.com/a.png)\n\n[bad](javascript:alert(1))',
        },
      ]}
      status="complete"
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByText('Review').tagName).toBe('STRONG');
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('img')).toBeNull();
  expect(screen.getByText('bad')).not.toHaveAttribute('href', 'javascript:alert(1)');
  fireEvent.click(screen.getByRole('button', { name: 'Copy response' }));
  await waitFor(() =>
    expect(screen.getByText('Couldn’t copy. Select and copy the text instead.')).toBeVisible(),
  );
});

test('a tool-only turn shows its work block and no empty reply', () => {
  render(
    <ChatPresentation
      messages={[
        {
          id: 'tool',
          role: 'assistant',
          text: '',
          work: {
            running: true,
            label: 'Reading your agent…',
            steps: [{ id: 'read', label: 'Read saved agent', status: 'pending', detail: '' }],
          },
        },
      ]}
      status="streaming"
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByRole('article')).toHaveTextContent('Reading your agent…');
  expect(screen.getByRole('timer')).toBeVisible();
  // Open while it runs, so the steps are visible without a click, and the only place progress is shown.
  expect(screen.getByText('Read saved agent')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
});

test('save errors remain visible without offering an unrelated generation retry', () => {
  render(
    <ChatPresentation
      messages={[]}
      status="complete"
      errorMessage="Storage full. Free some space and apply again."
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Storage full');
  expect(screen.queryByRole('button', { name: 'Retry response' })).not.toBeInTheDocument();
});

test('a failed step opens by itself with its reason, and response tables are keyboard accessible', () => {
  render(
    <ChatPresentation
      messages={[
        {
          id: 'text',
          role: 'assistant',
          text: '| Field | Value |\n| --- | --- |\n| Name | Aleksandra |',
          work: {
            running: false,
            seconds: 4,
            steps: [
              {
                id: 'validate',
                label: 'Validate proposal',
                status: 'failed',
                detail: 'Validation unavailable',
              },
            ],
          },
        },
      ]}
      status="complete"
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByText('Validation unavailable')).toBeVisible();
  expect(screen.getByText('Failed')).toBeVisible();
  expect(screen.getByRole('region', { name: 'Response table' })).toHaveAttribute('tabindex', '0');
});

test.each([false, true])('retry clears restored text, but preserves user edits: %s', edited => {
  const props = { messages: [], onSend: vi.fn(), onStop: vi.fn(), onRetry: vi.fn() };
  const { rerender } = render(<ChatPresentation {...props} status="idle" />);
  const input = screen.getByLabelText('Message Copilot');
  fireEvent.change(input, { target: { value: 'Improve the greeting.' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  rerender(<ChatPresentation {...props} status="error" />);
  expect(input).toHaveValue('Improve the greeting.');
  if (edited) fireEvent.change(input, { target: { value: 'My next request' } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry response' }));
  expect(props.onRetry).toHaveBeenCalledOnce();
  expect(input).toHaveValue(edited ? 'My next request' : '');
});

test('an interrupted turn has no spinner or completed indicator', () => {
  const { container } = render(
    <ChatPresentation
      messages={[
        {
          id: 'a',
          role: 'assistant',
          text: '',
          work: {
            running: false,
            steps: [{ id: 'patch', label: 'Validate proposal', status: 'interrupted', detail: '' }],
          },
        },
      ]}
      status="stopped"
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: /Interrupted/ })).toBeVisible();
  expect(container.querySelector('.animate-spin')).toBeNull();
  expect(screen.queryByLabelText('Completed')).not.toBeInTheDocument();
});

test('a finished turn collapses to how long it took, and opens on request', () => {
  render(
    <ChatPresentation
      messages={[
        {
          id: 'a',
          role: 'assistant',
          text: 'Done.',
          work: {
            running: false,
            seconds: 42,
            steps: [{ id: 'read', label: 'Read saved agent', status: 'completed', detail: '' }],
          },
        },
      ]}
      status="complete"
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  const toggle = screen.getByRole('button', { name: /Worked for 42s/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('Read saved agent')).not.toBeVisible();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Read saved agent')).toBeVisible();
});

test('before the first reply, the work block says what is happening with a ticking timer, once', () => {
  vi.useFakeTimers();
  try {
    const props = {
      messages: [{ id: 'u', role: 'user' as const, text: 'Build it' }],
      onSend: vi.fn(),
      onStop: vi.fn(),
      onRetry: vi.fn(),
    };
    const { rerender } = render(
      <ChatPresentation {...props} status="pending" progress="Writing the graph… 3 steps" />,
    );
    expect(screen.getByRole('article', { name: 'Copilot response' })).toHaveTextContent(
      'Writing the graph… 3 steps',
    );
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    act(() => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('1:05');
    // Never a second visible copy: the live region for screen readers is the only other mention.
    expect(
      screen.getAllByText(/Writing the graph/).filter(element => !element.closest('.sr-only')),
    ).toHaveLength(1);
    rerender(<ChatPresentation {...props} status="streaming" />);
    expect(screen.getByRole('article', { name: 'Copilot response' })).toHaveTextContent('Thinking…');
    rerender(<ChatPresentation {...props} status="complete" />);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
