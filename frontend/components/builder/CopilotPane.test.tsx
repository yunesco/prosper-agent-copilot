// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ChatPresentation } from '@/components/chat/ChatPresentation';
import { loadAgentFixture } from '@/lib/fixtures';
import type { BehaviorReview } from '@/lib/agent/proposals';
import type { SavedAgent } from '@/lib/agent/repository';
import { CopilotPane } from './CopilotPane';
import { useCopilot } from './use-copilot';

vi.mock('@/components/chat/ChatPresentation', () => ({
  ChatPresentation: ({ activities, children }: ComponentProps<typeof ChatPresentation>) => (
    <>
      <ul>
        {activities?.map(activity => (
          <li key={activity.id}>
            {activity.label}: {activity.status} — {activity.detail}
          </li>
        ))}
      </ul>
      {children}
    </>
  ),
}));
afterEach(cleanup);
const record: SavedAgent = {
  id: 'test-agent',
  revision: 1,
  agent: loadAgentFixture('clinic-scheduler'),
  guidelines: '',
};
function Harness({ output }: { output: unknown }) {
  const copilot = useCopilot(record, null);
  return (
    <CopilotPane
      copilot={{
        ...copilot,
        messages: [
          {
            id: 'response',
            role: 'assistant',
            parts: [
              {
                type: 'dynamic-tool',
                toolName: 'propose_agent_patch',
                toolCallId: 'patch',
                state: 'output-available',
                input: {},
                output,
              },
            ],
          },
        ],
      }}
      record={record}
      selected={null}
      dirty={false}
      applying={false}
      error=""
      onApply={vi.fn()}
      onFocus={vi.fn()}
      onTest={vi.fn()}
    />
  );
}

test.each([
  [{ valid: false, error: 'Step cannot reach an end.' }, 'Step cannot reach an end.'],
  [{ error: 'Validation service unavailable.' }, 'Validation service unavailable.'],
  [{ valid: false }, 'The proposal could not be validated.'],
])('a completed tool returning rejection is shown as failed: %j', (output, detail) => {
  render(<Harness output={output} />);
  expect(screen.getByRole('listitem')).toHaveTextContent(`Validate proposal: failed — ${detail}`);
});

test('a successful tool output remains completed', () => {
  render(<Harness output={{ valid: true }} />);
  expect(screen.getByRole('listitem')).toHaveTextContent('Validate proposal: completed — Tool finished.');
});

function UnfinishedHarness({
  status,
  stopped = false,
  newerMessage = false,
}: {
  status: 'ready' | 'streaming' | 'error';
  stopped?: boolean;
  newerMessage?: boolean;
}) {
  const copilot = useCopilot(record, null);
  const messages: typeof copilot.messages = [
    {
      id: 'unfinished',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'propose_agent_patch',
          toolCallId: 'unfinished-patch',
          state: 'input-available',
          input: {},
        },
      ],
    },
  ];
  if (newerMessage)
    messages.push({ id: 'newer', role: 'assistant', parts: [{ type: 'text', text: 'New response' }] });
  return (
    <CopilotPane
      copilot={{ ...copilot, status, busy: status === 'streaming', stopped, messages }}
      record={record}
      selected={null}
      dirty={false}
      applying={false}
      error=""
      onApply={vi.fn()}
      onFocus={vi.fn()}
      onTest={vi.fn()}
    />
  );
}

test.each(['ready', 'error'] as const)('unfinished tool is interrupted after %s', status => {
  render(<UnfinishedHarness status={status} />);
  expect(screen.getByRole('listitem')).toHaveTextContent('Validate proposal: interrupted');
});
test('stop immediately interrupts tool feedback, even before transport settles', () => {
  render(<UnfinishedHarness status="streaming" stopped />);
  expect(screen.getByRole('listitem')).toHaveTextContent('Validate proposal: interrupted');
});
test('a later generation cannot revive an old unfinished tool', () => {
  render(<UnfinishedHarness status="streaming" newerMessage />);
  expect(screen.getByRole('listitem')).toHaveTextContent('Validate proposal: interrupted');
});
test('the current generation retains pending tool feedback', () => {
  render(<UnfinishedHarness status="streaming" />);
  expect(screen.getByRole('listitem')).toHaveTextContent('Validate proposal: pending');
});

const review: BehaviorReview = {
  agentId: record.id,
  revision: 1,
  summary: 'Review findings',
  behaviors: [
    {
      behavior: 'Insurance',
      finding: 'Ask only new patients',
      excerpt: 'New patients provide insurance.',
      references: [{ kind: 'node', node: 'collect_details' }],
      status: 'potential_mismatch',
      clarification: null,
    },
    {
      behavior: 'Scheduling',
      finding: 'Restrict eligible days',
      excerpt: 'Monday and Wednesday only.',
      references: [],
      status: 'potential_mismatch',
      clarification: null,
    },
    {
      behavior: 'Ambiguous requirement',
      finding: 'Unclear',
      excerpt: 'Offer alternatives.',
      references: [],
      status: 'ambiguous',
      clarification: 'Which alternatives?',
    },
    {
      behavior: 'Aligned requirement',
      finding: 'Already correct',
      excerpt: 'Collect name.',
      references: [],
      status: 'aligned',
      clarification: null,
    },
  ],
};
function ReviewHarness({
  send,
  busy = false,
  saved = record,
  findings = review,
}: {
  send: (text: string, intent?: 'chat' | 'review') => void;
  busy?: boolean;
  saved?: SavedAgent;
  findings?: BehaviorReview;
}) {
  const copilot = useCopilot(saved, null);
  return (
    <CopilotPane
      copilot={{ ...copilot, busy, reviews: [findings], send }}
      record={saved}
      selected={null}
      dirty={false}
      applying={false}
      error=""
      onApply={vi.fn()}
      onFocus={vi.fn()}
      onTest={vi.fn()}
    />
  );
}
test('all changes sends one grounded batch request containing only potential mismatches', () => {
  const send = vi.fn();
  render(<ReviewHarness send={send} />);
  fireEvent.click(screen.getByRole('button', { name: 'Propose all changes' }));
  expect(send).toHaveBeenCalledTimes(1);
  const prompt = send.mock.calls[0][0];
  for (const text of [
    'one atomic propose_agent_patch batch',
    'Insurance',
    'Scheduling',
    'New patients provide insurance.',
    'collect_details',
  ])
    expect(prompt).toContain(text);
  expect(prompt).not.toContain('Ambiguous requirement');
  expect(prompt).not.toContain('Aligned requirement');
  expect(screen.getAllByRole('button', { name: 'Propose change' })).toHaveLength(2);
});
test('individual actions become available again after generation', () => {
  const send = vi.fn();
  const view = render(<ReviewHarness send={send} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Propose change' })[0]);
  view.rerender(<ReviewHarness send={send} busy />);
  expect(screen.getAllByRole('button', { name: 'Propose change' })[1]).toBeDisabled();
  view.rerender(<ReviewHarness send={send} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Propose change' })[1]);
  expect(send).toHaveBeenCalledTimes(2);
});
test.each([
  { ...record, revision: 2 },
  { ...record, id: 'another-agent' },
])('outdated or foreign review cannot propose changes', saved => {
  const send = vi.fn();
  render(<ReviewHarness send={send} saved={saved} />);
  for (const button of screen.getAllByRole('button', { name: /Propose/ })) expect(button).toBeDisabled();
  expect(send).not.toHaveBeenCalled();
});
test('a review without mismatches has no bulk action', () => {
  render(
    <ReviewHarness
      send={vi.fn()}
      findings={{
        ...review,
        behaviors: review.behaviors.filter(item => item.status !== 'potential_mismatch'),
      }}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Propose all changes' })).not.toBeInTheDocument();
});

test('a verbose Markdown overview stays disclosed while actions and findings remain scannable', () => {
  const summary = '**Scheduling review**\n\n' + 'A long model explanation. '.repeat(100);
  render(<ReviewHarness send={vi.fn()} findings={{ ...review, summary }} />);
  expect(screen.getByRole('button', { name: 'Propose all changes' })).toBeVisible();
  expect(screen.getByText('2 potential mismatches')).toBeVisible();
  const overview = screen.getByText('Read model overview').closest('details')!;
  expect(overview).not.toHaveAttribute('open');
  expect(overview.querySelector('strong')).toHaveTextContent('Scheduling review');
  expect(screen.queryByText('**Scheduling review**')).not.toBeInTheDocument();
  const finding = screen.getByText('Insurance').closest('details')!;
  expect(finding).not.toHaveAttribute('open');
  expect(finding).toHaveTextContent('New patients provide insurance.');
});
