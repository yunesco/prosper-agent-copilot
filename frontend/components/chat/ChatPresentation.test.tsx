// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

test('tool-only assistant messages do not create empty conversation turns', () => {
  render(
    <ChatPresentation
      messages={[{ id: 'tool', role: 'assistant', text: '' }]}
      activities={[{ id: 'read', label: 'Read saved agent', status: 'pending', detail: 'Reading context' }]}
      status="streaming"
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  // The drawer header summarises progress; the step row inside is collapsed.
  expect(screen.getAllByText('In progress')[0]).toBeVisible();
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

test('collapsed activity exposes failures and response tables are keyboard accessible', () => {
  render(
    <ChatPresentation
      messages={[
        { id: 'text', role: 'assistant', text: '| Field | Value |\n| --- | --- |\n| Name | Aleksandra |' },
      ]}
      activities={[
        { id: 'validate', label: 'Validate proposal', status: 'failed', detail: 'Validation unavailable' },
      ]}
      status="complete"
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByText('1 failed')).toBeVisible();
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

test('interrupted activity has no spinner or completed indicator', () => {
  const { container } = render(
    <ChatPresentation
      messages={[]}
      activities={[
        {
          id: 'patch',
          label: 'Validate proposal',
          status: 'interrupted',
          detail: 'Tool interrupted before completion.',
        },
      ]}
      status="stopped"
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByText('1 interrupted')).toBeVisible();
  expect(container.querySelector('.animate-spin')).toBeNull();
  expect(screen.queryByLabelText('Completed')).not.toBeInTheDocument();
});

test('activity steps expand to their result and failures open by default', () => {
  render(
    <ChatPresentation
      messages={[]}
      activities={[
        { id: 'read', label: 'Read saved agent', status: 'completed', detail: 'Tool finished.' },
        { id: 'patch', label: 'Validate proposal', status: 'failed', detail: 'No path to an end step.' },
      ]}
      status="complete"
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText('Activity (2)'));
  expect(screen.getByText('No path to an end step.')).toBeVisible();
  expect(screen.getByText('Tool finished.')).not.toBeVisible();
  fireEvent.click(screen.getByText('Read saved agent'));
  expect(screen.getByText('Tool finished.')).toBeVisible();
});
