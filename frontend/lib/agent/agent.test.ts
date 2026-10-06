import { expect, test } from 'vitest';
import { loadAgentFixture } from '../fixtures';
import { parseAgent } from './schema';
import { agentOperationSchema, applyAgentOperations } from './operations';

test('normalizes the runtime defaults', () => {
  const agent = parseAgent({ name: 'Minimal', initial_node: 'start', nodes: [{ name: 'start' }] });
  expect(agent.model).toBe('gpt-4o');
  expect(agent.nodes[0]).toEqual({
    name: 'start',
    task_messages: [],
    role_message: null,
    edges: [],
    pre_actions: [],
    post_actions: [],
    end: false,
  });
});

test.each([
  { name: 'bad', initial_node: 'start', nodes: [] },
  { name: 'bad', initial_node: 'missing', nodes: [{ name: 'start' }] },
  {
    name: 'bad',
    initial_node: 'start',
    nodes: [{ name: 'start', edges: [{ function: 'go', description: '', target: 'missing' }] }],
  },
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
  expect(() =>
    applyAgentOperations(agent, [
      { type: 'update_agent', changes: { name: 'Valid first' } },
      { type: 'update_agent', changes: {} },
    ]),
  ).toThrow();
  expect(agent).toEqual(before);
});

test('a targeted rename preserves every other field, including non-default settings', () => {
  const agent = { ...loadAgentFixture('original-scheduler'), voice_id: 'custom', model: 'custom-model' };
  const updated = applyAgentOperations(agent, [{ type: 'update_agent', changes: { name: 'Renamed' } }]);
  expect(updated).toEqual({ ...agent, name: 'Renamed' });
});

test('instruction and transition edits preserve native data and collection contracts', () => {
  const agent = loadAgentFixture('original-scheduler');
  const node = agent.nodes[1];
  node.task_messages[0].extra = { nested: [true, null] };
  const before = structuredClone(agent);
  const messages = node.task_messages.map(message => ({ ...message, content: 'Updated' }));
  const updated = applyAgentOperations(agent, [
    { type: 'update_node', node: node.name, changes: { task_messages: messages } },
    {
      type: 'update_edge',
      node: node.name,
      function: 'record_details',
      changes: { description: 'Updated transition', target: 'confirm' },
    },
  ]);
  expect(updated.nodes[1]).toEqual({
    ...node,
    task_messages: messages,
    edges: [{ ...node.edges[0], description: 'Updated transition', target: 'confirm' }],
  });
  expect(agent).toEqual(before);
});

test.each([
  { type: 'update_node' as const, node: 'missing', changes: { role_message: 'test' } },
  { type: 'update_edge' as const, node: 'greeting', function: 'missing', changes: { target: 'confirm' } },
  {
    type: 'update_edge' as const,
    node: 'greeting',
    function: 'choose_intent',
    changes: { target: 'missing' },
  },
])('failed batch is atomic: $type', operation => {
  const agent = loadAgentFixture('original-scheduler');
  const before = structuredClone(agent);
  expect(() =>
    applyAgentOperations(agent, [{ type: 'update_agent', changes: { name: 'Must not commit' } }, operation]),
  ).toThrow();
  expect(agent).toEqual(before);
});

test('partial instruction patches never insert node defaults or accept empty changes', () => {
  const agent = loadAgentFixture('original-scheduler');
  const node = agent.nodes[0];
  const updated = applyAgentOperations(agent, [
    { type: 'update_node', node: node.name, changes: { role_message: 'Override' } },
  ]);
  expect(updated.nodes[0]).toEqual({ ...node, role_message: 'Override' });
  expect(() => agentOperationSchema.parse({ type: 'update_node', node: node.name, changes: {} })).toThrow();
});

test('addresses transitions by function after reordering and rejects ambiguous names atomically', () => {
  const agent = loadAgentFixture('original-scheduler');
  const node = agent.nodes[0];
  node.edges.unshift({ ...node.edges[0], function: 'another' });
  const operation = {
    type: 'update_edge' as const,
    node: node.name,
    function: 'choose_intent',
    changes: { description: 'Changed' },
  };
  const updated = applyAgentOperations(agent, [operation]);
  expect(updated.nodes[0].edges[0]).toEqual(node.edges[0]);
  expect(updated.nodes[0].edges[1].description).toBe('Changed');
  node.edges[0].function = 'choose_intent';
  const before = structuredClone(agent);
  expect(() =>
    applyAgentOperations(agent, [{ type: 'update_agent', changes: { name: 'Never saved' } }, operation]),
  ).toThrow('exactly one transition');
  expect(agent).toEqual(before);
  expect(() =>
    agentOperationSchema.parse({
      type: 'update_edge',
      node: node.name,
      edge_index: 0,
      changes: { description: 'Old addressing' },
    }),
  ).toThrow();
  expect(() =>
    agentOperationSchema.parse({ type: 'update_agent', changes: { model: 'not-a-model' } }),
  ).toThrow();
});

test('structural batches delete, rename and update by current names, preserving native JSON', () => {
  const agent = loadAgentFixture('original-scheduler');
  const before = structuredClone(agent);
  const result = applyAgentOperations(agent, [
    { type: 'add_node', value: { ...agent.nodes[3], name: 'insurance', end: false, edges: [] } },
    {
      type: 'add_edge',
      node: 'insurance',
      value: { function: 'discard', description: '', target: 'confirm', properties: {}, required: [] },
    },
    {
      type: 'add_edge',
      node: 'insurance',
      value: {
        function: 'record',
        description: '',
        target: 'offer_times',
        properties: { insurance: { type: 'string', extra: { native: [true, null] } } },
        required: ['insurance'],
      },
    },
    { type: 'delete_edge', node: 'insurance', function: 'discard' },
    { type: 'update_edge', node: 'insurance', function: 'record', changes: { function: 'record_insurance' } },
    {
      type: 'update_edge',
      node: 'insurance',
      function: 'record_insurance',
      changes: { description: 'Insurance collected' },
    },
    {
      type: 'update_edge',
      node: 'collect_details',
      function: 'record_details',
      changes: { target: 'insurance' },
    },
    { type: 'delete_node', node: 'greeting' },
    { type: 'update_agent', changes: { initial_node: 'collect_details' } },
  ]);
  expect(result.initial_node).toBe('collect_details');
  expect(result.nodes.at(-1)?.edges).toEqual([
    {
      function: 'record_insurance',
      description: 'Insurance collected',
      target: 'offer_times',
      properties: { insurance: { type: 'string', extra: { native: [true, null] } } },
      required: ['insurance'],
    },
  ]);
  expect(agent).toEqual(before);
});

test('structural failures cannot partially apply and renamed addresses expire immediately', () => {
  const agent = loadAgentFixture('original-scheduler');
  const before = structuredClone(agent);
  for (const operations of [
    [{ type: 'delete_node', node: 'greeting' }],
    [{ type: 'delete_node', node: 'offer_times' }],
    [{ type: 'add_node', value: agent.nodes[0] }],
    [{ type: 'add_edge', node: 'greeting', value: agent.nodes[0].edges[0] }],
    [{ type: 'delete_edge', node: 'greeting', function: 'missing' }],
    [
      { type: 'update_edge', node: 'greeting', function: 'choose_intent', changes: { function: 'renamed' } },
      { type: 'delete_edge', node: 'greeting', function: 'choose_intent' },
    ],
  ]) {
    const parsed = operations.map(operation => agentOperationSchema.parse(operation));
    expect(() => applyAgentOperations(agent, parsed)).toThrow();
    expect(agent).toEqual(before);
  }
  expect(() =>
    agentOperationSchema.parse({ type: 'update_agent', changes: { voice_id: 'unsupported' } }),
  ).toThrow();
});
