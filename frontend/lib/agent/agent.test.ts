import { expect, test } from 'vitest';
import { loadAgentFixture } from '../fixtures';
import { parseAgent } from './schema';
import { agentOperationSchema, applyAgentOperations } from './operations';

test('normalizes the runtime defaults', () => {
  const agent = parseAgent({ name: 'Minimal', initial_node: 'start', nodes: [{ name: 'start' }] });
  expect(agent.model).toBe('gpt-4o');
  expect(agent.nodes[0]).toEqual({
    name: 'start', task_messages: [], role_message: null, edges: [], pre_actions: [], post_actions: [], end: false,
  });
});

test.each([
  { name: 'bad', initial_node: 'start', nodes: [] },
  { name: 'bad', initial_node: 'missing', nodes: [{ name: 'start' }] },
  { name: 'bad', initial_node: 'start', nodes: [{ name: 'start', edges: [{ function: 'go', description: '', target: 'missing' }] }] },
])('rejects graphs the builder cannot compile', input => {
  expect(() => parseAgent(input)).toThrow();
});

test('applies metadata operations in order without mutating or aliasing the input', () => {
  const original = loadAgentFixture('original-scheduler');
  const before = structuredClone(original);
  const updated = applyAgentOperations(original, [
    { type: 'update_agent', changes: { name: 'First' } },
    { type: 'update_agent', changes: { name: 'Final', persona: 'Be concise.' } },
  ]);
  expect(updated.name).toBe('Final');
  expect(updated.persona).toBe('Be concise.');
  expect(updated.nodes).toEqual(original.nodes);
  updated.nodes[0].name = 'isolated';
  expect(original).toEqual(before);
});

test('rejects unsupported and empty patches; invalid batches leave the input untouched', () => {
  const agent = loadAgentFixture('original-scheduler');
  const before = structuredClone(agent);
  expect(() => agentOperationSchema.parse({ type: 'delete_node', name: 'greeting' })).toThrow();
  expect(() => agentOperationSchema.parse({ type: 'update_agent', changes: {} })).toThrow();
  expect(() => agentOperationSchema.parse({ type: 'update_agent', changes: { nodes: [] } })).toThrow();
  expect(() => applyAgentOperations(agent, [
    { type: 'update_agent', changes: { name: 'Valid first' } },
    { type: 'update_agent', changes: {} },
  ])).toThrow();
  expect(agent).toEqual(before);
});

test('a targeted rename preserves every other field, including non-default settings', () => {
  const agent = { ...loadAgentFixture('original-scheduler'), voice_id: 'custom', model: 'custom-model' };
  const updated = applyAgentOperations(agent, [{ type: 'update_agent', changes: { name: 'Renamed' } }]);
  expect(updated).toEqual({ ...agent, name: 'Renamed' });
});
