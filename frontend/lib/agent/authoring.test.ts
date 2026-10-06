import { expect, test } from 'vitest';
import { loadAgentFixture } from '../fixtures';
import { connectStepOperations, createTransitionOperation } from './authoring';
import { applyAgentOperations } from './operations';

test('canvas connections atomically connect ending steps and preserve native payloads', () => {
  const agent = loadAgentFixture('original-scheduler');
  const ending = agent.nodes.find(node => node.name === 'confirm')!;
  ending.post_actions = [{ type: 'custom', payload: { retained: true } }];
  const before = structuredClone(agent);
  const candidate = applyAgentOperations(agent, connectStepOperations(agent, 'confirm', 'greeting'));
  expect(candidate.nodes.find(node => node.name === 'confirm')).toMatchObject({
    end: false, post_actions: ending.post_actions,
    edges: [{ target: 'greeting', description: 'When this step is complete.', function: 'go_to_greeting', properties: {}, required: [] }],
  });
  expect(agent).toEqual(before);
  expect(() => connectStepOperations(agent, 'missing', 'greeting')).toThrow('source');
  expect(() => connectStepOperations(agent, 'confirm', 'missing')).toThrow('target');
  expect(agent).toEqual(before);
});

test('manual connections require human conditions and generate unique valid tool names', () => {
  const agent = loadAgentFixture('original-scheduler');
  expect(() => createTransitionOperation(agent, 'greeting', 'confirm', '  ')).toThrow('Describe when');
  expect(() => createTransitionOperation(agent, 'missing', 'confirm', 'Done')).toThrow('source');
  const first = createTransitionOperation(agent, 'greeting', 'confirm', '  The caller wants to finish.  ');
  const next = applyAgentOperations(agent, [first]);
  const second = createTransitionOperation(next, 'greeting', 'confirm', 'The caller says goodbye.');
  expect(first).toMatchObject({ value: { function: 'go_to_confirm', description: 'The caller wants to finish.' } });
  expect(second).toMatchObject({ value: { function: 'go_to_confirm_2', description: 'The caller says goodbye.' } });
});

test('step IDs are generated from readable names, including duplicates and Unicode', async () => {
  const { createStepOperations } = await import('./authoring');
  const agent = loadAgentFixture('original-scheduler');
  const first = createStepOperations(agent, '  Collect insurance  ', 'collect_details', true, 'The caller is a new patient.', 'Ask for insurance.');
  expect(first.nodeId).toBe('Collect_insurance');
  expect(() => createStepOperations(agent, 'Insurance', null, false, '', '  ')).toThrow('what the agent should do');
  const next = applyAgentOperations(agent, first.operations);
  expect(next.nodes.find(node => node.name === first.nodeId)?.task_messages).toEqual([{ role: 'system', content: 'Ask for insurance.' }]);
  expect(next.nodes.find(node => node.name === 'collect_details')?.edges).toContainEqual(expect.objectContaining({ target: first.nodeId, description: 'The caller is a new patient.' }));
  expect(createStepOperations(next, 'Collect insurance', null, true, '', 'Say goodbye.').nodeId).toBe('Collect_insurance_2');
  expect(createStepOperations(next, 'Datos del paciente — معلومات', null, true, '', 'Say goodbye.').nodeId).toBe('Datos_del_paciente_—_معلومات');
  expect(() => createStepOperations(agent, '  ', null, false, '', 'Ask for insurance.')).toThrow('name');
  expect(() => createStepOperations(agent, 'Insurance', 'collect_details', false, ' ', 'Ask for insurance.')).toThrow('Describe when');
});

test('either endpoint moves atomically while preserving fields, condition and native actions', async () => {
  const { reconnectStepOperations } = await import('./authoring');
  const agent = loadAgentFixture('original-scheduler');
  const before = structuredClone(agent);
  const original = agent.nodes[2].edges[0];
  const moved = applyAgentOperations(agent, reconnectStepOperations(agent, 'offer_times', original.function, 'collect_details', 'confirm'));
  expect(moved.nodes[2].edges).toEqual([]);
  expect(moved.nodes[1].edges).toContainEqual(original);
  expect(moved.nodes[0]).toEqual(agent.nodes[0]);
  expect(agent).toEqual(before);
  expect(() => reconnectStepOperations(moved, 'collect_details', original.function, 'missing', 'confirm')).toThrow();
  const duplicate = structuredClone(agent);
  duplicate.nodes[1].edges.push(original);
  expect(() => reconnectStepOperations(duplicate, 'offer_times', original.function, 'collect_details', 'confirm')).toThrow('already has');
});
