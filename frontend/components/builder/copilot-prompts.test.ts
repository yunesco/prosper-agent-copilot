import { expect, test } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { minimalAgent } from '@/lib/agent/repository';
import { copilotEmptyState } from './copilot-prompts';

const built = loadAgentFixture('clinic-scheduler');
const first = built.nodes[0].name;

test('scaffold agents get the build-from-nothing prompt', () => {
  const state = copilotEmptyState(minimalAgent(), '', null);
  expect(state.title).toBe('What should your voice agent do?');
  expect(state.suggestions.map(item => item.label)).toEqual(['Design an agent from scratch']);
});
test('a built agent is not offered the from-scratch prompt', () => {
  const withGuidelines = copilotEmptyState(built, 'Existing patients skip insurance.', null);
  expect(withGuidelines.suggestions.map(item => item.label)).toContain('Review behavior against guidelines');
  const without = copilotEmptyState(built, '  ', null);
  expect(without.body).toContain('no guidelines');
  for (const state of [withGuidelines, without])
    expect(state.suggestions.map(item => item.label)).not.toContain('Design an agent from scratch');
});
test('selection scopes the suggestions to the step or transition', () => {
  const node = copilotEmptyState(built, 'g', { kind: 'node', node: first });
  expect(node.title).toBe('Ask about this step');
  expect(node.suggestions[0].prompt).toContain(first);
  const edge = built.nodes[0].edges[0];
  const transition = copilotEmptyState(built, 'g', {
    kind: 'transition',
    node: first,
    function: edge.function,
  });
  expect(transition.title).toBe('Ask about this transition');
});
