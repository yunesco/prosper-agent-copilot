// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { applyAgentOperations } from '@/lib/agent/operations';
import { candidateDiff, type Proposal } from '@/lib/agent/proposals';
import { proposalReviewRows, proposalReviewText, proposalReviewTexts } from '@/lib/agent/proposal-review';
import { minimalAgent, type SavedAgent } from '@/lib/agent/repository';
import { loadAgentFixture } from '@/lib/fixtures';
import { ProposalCard } from './ProposalCard';

afterEach(cleanup);
const record: SavedAgent = {
  id: 'clinic-scheduler',
  revision: 1,
  agent: loadAgentFixture('clinic-scheduler'),
  guidelines: '',
};
const operations: Proposal['operations'] = [
  { type: 'update_agent', changes: { name: 'Renamed clinic agent' } },
];
const proposal: Proposal = {
  id: 'p1',
  agentId: record.id,
  baseRevision: 1,
  outcome: 'Rename the agent',
  explanation: 'Clearer name.',
  behavior: 'No call behavior changes.',
  operations,
  candidate: applyAgentOperations(record.agent, operations),
  validation: { valid: true },
};
function show(overrides: Partial<ComponentProps<typeof ProposalCard>> = {}) {
  const props: ComponentProps<typeof ProposalCard> = {
    proposal,
    base: record,
    state: 'Ready to apply',
    record,
    dirty: false,
    applying: false,
    onApply: vi.fn(),
    onDismiss: vi.fn(),
    onFocus: vi.fn(),
    onTest: vi.fn(),
    onPreview: vi.fn(),
    ...overrides,
  };
  return { ...render(<ProposalCard {...props} />), props };
}

test('shows readable rows immediately and reveals the full diff only through View', () => {
  const { container, props } = show();
  const global = screen.getByRole('region', { name: 'Global changes' });
  expect(within(global).getByText('Agent settings')).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Step changes' })).not.toBeInTheDocument();
  expect(screen.queryByText('Implementation')).not.toBeInTheDocument();
  expect(screen.getByText('Clearer name.')).not.toBeVisible();
  const view = within(global).getByRole('button', { name: 'View changes to Agent settings' });
  expect(view).toHaveAttribute('aria-expanded', 'false');
  expect(global.querySelector('ins')).not.toBeVisible();
  fireEvent.click(view);
  expect(global.querySelector('ins')).toBeVisible();
  expect(global.querySelector('ins')).toHaveTextContent('Renamed');
  expect(global.querySelector('del')).toBeVisible();
  fireEvent.click(within(global).getByRole('button', { name: 'Hide changes to Agent settings' }));
  expect(global.querySelector('ins')).not.toBeVisible();
  expect(container.querySelector('summary')?.textContent).toContain('Why these changes');
  expect(screen.getAllByRole('button', { name: 'Apply' })).toHaveLength(1);
  expect(props.onApply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(props.onApply).toHaveBeenCalledWith(proposal, record);
});

test('groups instructions and all transition changes under their owning step without dropping diff entries', () => {
  const node = record.agent.nodes[0];
  const edge = node.edges[0];
  const operations: Proposal['operations'] = [
    { type: 'update_agent', changes: { persona: 'Be concise.', name: 'Clinic' } },
    {
      type: 'update_node',
      node: node.name,
      changes: {
        task_messages: [{ role: 'developer', content: 'New instructions.' }],
        role_message: 'New role.',
      },
    },
    { type: 'delete_edge', node: node.name, function: edge.function },
    { type: 'add_edge', node: node.name, value: { ...edge, function: 'new_route' } },
    { type: 'add_edge', node: node.name, value: { ...edge, function: 'another_route' } },
  ];
  const updated = {
    ...proposal,
    operations,
    candidate: applyAgentOperations(record.agent, operations),
    guidelines: 'New guidelines.',
  };
  const snapshot = JSON.stringify({ record, updated });
  const rows = proposalReviewRows(record, updated);
  expect(rows.filter(row => row.kind === 'step')).toHaveLength(1);
  expect(rows.map(row => row.title)).toEqual([
    'Agent instructions',
    'Client guidelines',
    'Agent settings',
    'Collect details',
  ]);
  expect(rows.at(-1)?.summary).toBe('Instructions updated · 2 transitions added · 1 transition removed');
  const contents = (changes: { before: unknown; after: unknown }[]) =>
    changes.map(({ before, after }) => JSON.stringify([before, after])).sort();
  expect(contents(rows.flatMap(row => row.changes))).toEqual(
    contents(
      candidateDiff(record.agent, updated.candidate, {
        before: record.guidelines,
        after: updated.guidelines,
      }),
    ),
  );
  expect(JSON.stringify({ record, updated })).toBe(snapshot);
  const { props } = show({ proposal: updated });
  fireEvent.click(screen.getByRole('button', { name: 'View changes to Collect details' }));
  expect(screen.getByText('Instructions', { exact: true })).toBeVisible();
  expect(screen.getByText('Transition: New route')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Show step on canvas' }));
  expect(props.onPreview).toHaveBeenCalledWith(updated, { kind: 'node', node: node.name });
});

test('added and removed steps retain their complete content and removed steps have no canvas link', () => {
  const base = { ...record, agent: minimalAgent() };
  const candidate = record.agent;
  const updated = { ...proposal, candidate };
  show({ proposal: updated, base });
  expect(screen.getByText('Step removed')).toBeVisible();
  expect(screen.getAllByText('Step added')).toHaveLength(candidate.nodes.length);
  fireEvent.click(screen.getByRole('button', { name: 'View changes to Start' }));
  const removed = screen.getByText('Step removed').closest('li')!;
  expect(removed.querySelector('del')).toHaveTextContent('start');
  expect(within(removed).queryByRole('button', { name: 'Show step on canvas' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View changes to Collect details' }));
  const added = screen.getByText('Collect details', { exact: true }).closest('li')!;
  expect(added.querySelector('ins')).toHaveTextContent(String(candidate.nodes[0].task_messages[0].content));
});

test.each([{ dirty: true }, { applying: true }, { base: undefined }])(
  'Apply stays blocked: %j',
  overrides => {
    const { props } = show(overrides);
    const apply = screen.getByRole('button', { name: /^(Apply|Applying…)$/ });
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(props.onApply).not.toHaveBeenCalled();
  },
);

test.each(['Out of date', 'Superseded', 'Interrupted', 'Dismissed', 'Validating proposal…'])(
  'non-ready state %s cannot apply or preview',
  state => {
    show({ state });
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inspect on canvas' })).not.toBeInTheDocument();
  },
);

test('Dismiss and post-Apply Test Call retain their existing actions', () => {
  const { props, unmount } = show();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(props.onDismiss).toHaveBeenCalledOnce();
  expect(props.onApply).not.toHaveBeenCalled();
  unmount();
  const applied = show({ state: 'Applied', record: { ...record, revision: 2 } });
  expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Test Call' }));
  expect(applied.props.onTest).toHaveBeenCalledOnce();
});

test('instruction review displays real line breaks without serialized message brackets or escapes', () => {
  const content = 'Confirm the request.\n- Ask for confirmation again.\n- Close the call.';
  const operations: Proposal['operations'] = [
    {
      type: 'update_node',
      node: 'collect_details',
      changes: { task_messages: [{ role: 'developer', content }] },
    },
  ];
  const updated = { ...proposal, operations, candidate: applyAgentOperations(record.agent, operations) };
  const { container } = show({ proposal: updated });
  fireEvent.click(screen.getByRole('button', { name: 'View changes to Collect details' }));
  const diff = container.querySelector('pre')!;
  expect(diff.textContent).toContain(content);
  expect(diff.textContent).not.toMatch(/[\[\]{}]/);
  expect(diff.textContent).not.toContain('\\n');
  expect(diff.textContent).not.toContain('Message role');
  expect(screen.queryByRole('button', { name: 'Inspect on canvas' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Show step on canvas' })).toHaveLength(1);
});

test('changed message roles and native metadata remain reviewable', () => {
  const before = [{ role: 'developer', content: 'Same content.' }];
  const roleChange = proposalReviewTexts(before, [{ role: 'user', content: 'Same content.' }]);
  expect(roleChange.before).toContain('Message role: developer');
  expect(roleChange.after).toContain('Message role: user');
  const metadataChange = proposalReviewTexts(before, [{ ...before[0], priority: 3 }]);
  expect(metadataChange.after).toContain('Priority: 3');
});

test('readable nested payloads retain native metadata, types, order, and empty values', () => {
  const text = proposalReviewText([
    {
      role: 'developer',
      content: [{ type: 'text', text: 'First line.\nSecond line.' }],
      metadata: { priority: 2, enabled: false },
    },
    { role: 'user', content: 'Reply', optional: null, options: [] },
  ]);
  for (const value of [
    '1.',
    '2.',
    'developer',
    'user',
    'Type: text',
    'First line.\nSecond line.',
    'Priority: 2',
    'Enabled: No',
    'Optional: Not set',
    'Options:\nNone',
  ])
    expect(text).toContain(value);
  expect(text).not.toMatch(/[\[\]{}]/);
});
