// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import type { SavedAgent } from '@/lib/agent/repository';
import { CopilotPane } from './CopilotPane';
import { useCopilot } from './use-copilot';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const record: SavedAgent = {
  id: 'clinic-scheduler',
  revision: 1,
  agent: loadAgentFixture('clinic-scheduler'),
  guidelines: '',
};
const read = {
  type: 'tool-get_call',
  toolCallId: 'c1',
  state: 'output-available',
  input: {},
  output: { id: 'new-patient-friday', transcript: [{ turn: 1 }, { turn: 2 }, { turn: 3 }] },
};
const answer =
  'The caller was offered Friday ([turn 3](call:new-patient-friday#3)), which the guideline forbids; see [turn 9](call:new-patient-friday#9) and [turn 1](call:invented-call#1). The cause is in [offer_times](graph:offer_times) and not [retired](graph:retired_step).';

function Harness({
  onOpenCall,
  onFocus,
}: {
  onOpenCall: (id: string, turn: number) => void;
  onFocus: (ref: unknown) => void;
}) {
  const copilot = useCopilot(record, null);
  const messages = [
    { id: 'a', role: 'assistant' as const, parts: [read, { type: 'text' as const, text: answer }] },
  ] as unknown as typeof copilot.messages;
  return (
    <CopilotPane
      copilot={{ ...copilot, messages }}
      record={record}
      selected={null}
      dirty={false}
      applying={false}
      error=""
      onApply={vi.fn()}
      onFocus={onFocus}
      onTest={vi.fn()}
      onOpenCall={onOpenCall}
    />
  );
}

test('call citations are links only for turns Copilot actually read; graph links only for existing elements', () => {
  const onOpenCall = vi.fn(),
    onFocus = vi.fn();
  render(<Harness onOpenCall={onOpenCall} onFocus={onFocus} />);
  fireEvent.click(screen.getByRole('button', { name: 'turn 3' }));
  expect(onOpenCall).toHaveBeenCalledExactlyOnceWith('new-patient-friday', 3);
  // Beyond the transcript, or from a call never read: visible but explicitly unverified.
  expect(screen.queryByRole('button', { name: 'turn 9' })).not.toBeInTheDocument();
  expect(screen.getByText('turn 9 (unverified)')).toBeVisible();
  expect(screen.getByText('turn 1 (unverified)')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'offer_times' }));
  expect(onFocus).toHaveBeenCalledExactlyOnceWith({ kind: 'node', node: 'offer_times' });
  expect(screen.getByText(/retired — unavailable in current graph/)).toBeVisible();
});
