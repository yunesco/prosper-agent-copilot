// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { applyAgentOperations } from '@/lib/agent/operations';
import type { Proposal } from '@/lib/agent/proposals';
import { loadAgentFixture } from '@/lib/fixtures';
import { ProposalInspector } from './ProposalInspector';

afterEach(cleanup);
const base = loadAgentFixture('clinic-scheduler');
const step = base.nodes[0];
const operations: Proposal['operations'] = [
  {
    type: 'update_node',
    node: step.name,
    changes: { task_messages: [{ role: 'developer', content: 'Welcome the caller by name.' }] },
  },
];
const proposal: Proposal = {
  id: 'p1',
  agentId: 'clinic-scheduler',
  baseRevision: 1,
  outcome: 'Update instructions',
  explanation: 'Why.',
  behavior: 'Behavior.',
  operations,
  candidate: applyAgentOperations(base, operations),
  validation: { valid: true },
};
const render_ = (selected: { kind: 'node'; node: string } | null) =>
  render(
    <ProposalInspector
      proposal={proposal}
      base={base}
      selected={selected}
      onSelect={vi.fn()}
      onReview={vi.fn()}
    />,
  );

test('a selected step marks changed instructions against the saved step', () => {
  const { container } = render_({ kind: 'node', node: step.name });
  expect(container.querySelector('ins')).toHaveTextContent('Welcome');
  expect(container.querySelector('del')).toBeInTheDocument();
});

test('unchanged text renders without diff marks', () => {
  const { container } = render(
    <ProposalInspector
      proposal={proposal}
      base={proposal.candidate}
      selected={{ kind: 'node', node: step.name }}
      onSelect={vi.fn()}
      onReview={vi.fn()}
    />,
  );
  expect(container.querySelector('ins, del')).toBeNull();
});
