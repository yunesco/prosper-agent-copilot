import { expect, test } from 'vitest';
import { loadAgentFixture } from '../fixtures';
import { proposalGraphChanges } from './proposal-graph';

test('marks added steps and transitions while preserving inputs and unchanged paths', () => {
  const before = loadAgentFixture('original-scheduler');
  const after = structuredClone(before);
  const added = { ...structuredClone(after.nodes[1]), name: 'collect_insurance' };
  after.nodes.push(added);
  after.nodes[0].edges.push({
    ...after.nodes[0].edges[0],
    function: 'request_insurance',
    target: added.name,
  });
  const snapshot = structuredClone({ before, after });
  const changes = proposalGraphChanges(before, after);
  expect(changes.nodes.get(added.name)).toBe('added');
  expect(changes.nodes.get(after.nodes[0].name)).toBe('changed');
  expect(changes.transitions.get(after.nodes[0].name)?.get('request_insurance')).toBe('added');
  expect(changes.transitions.get(added.name)?.get(added.edges[0].function)).toBe('added');
  expect(changes.nodes.has(after.nodes[2].name)).toBe(false);
  expect({ before, after }).toEqual(snapshot);
});

test('marks native instruction, transition condition, and target changes independently', () => {
  const before = loadAgentFixture('original-scheduler');
  const after = structuredClone(before);
  after.nodes[0].task_messages = [{ role: 'developer', content: 'Welcome the caller by name.' }];
  after.nodes[1].edges[0].description = 'Only after all required details are known.';
  after.nodes[2].edges[0].target = after.nodes[0].name;
  const changes = proposalGraphChanges(before, after);
  expect(changes.nodes.size).toBe(3);
  expect(changes.transitions.has(after.nodes[0].name)).toBe(false);
  expect(changes.transitions.get(after.nodes[1].name)?.get(after.nodes[1].edges[0].function)).toBe('changed');
  expect(changes.transitions.get(after.nodes[2].name)?.get(after.nodes[2].edges[0].function)).toBe('changed');
});

test('reordering nodes or transitions does not create proposed changes', () => {
  const before = loadAgentFixture('original-scheduler');
  before.nodes[0].edges.push({ ...before.nodes[0].edges[0], function: 'another_path' });
  const after = structuredClone(before);
  after.nodes[0].edges.reverse();
  after.nodes.reverse();
  const changes = proposalGraphChanges(before, after);
  expect(changes.nodes.size).toBe(0);
  expect(changes.transitions.size).toBe(0);
});

test('changed start roles and removed edges mark surviving nodes without phantom elements', () => {
  const before = loadAgentFixture('original-scheduler');
  const after = structuredClone(before);
  after.initial_node = after.nodes[1].name;
  after.nodes[0].edges = [];
  after.nodes.pop();
  const changes = proposalGraphChanges(before, after);
  expect(changes.nodes.get(before.initial_node)).toBe('changed');
  expect(changes.nodes.get(after.initial_node)).toBe('changed');
  expect(changes.nodes.has(before.nodes.at(-1)!.name)).toBe(false);
  expect(changes.transitions.size).toBe(0);
});

test('global settings alone do not falsely mark graph elements', () => {
  const before = loadAgentFixture('original-scheduler');
  const after = { ...before, name: 'Renamed agent' };
  expect(proposalGraphChanges(before, after).nodes.size).toBe(0);
});
