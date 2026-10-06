import { expect, test } from 'vitest';
import { loadAgentFixture } from '../fixtures';
import { createTransitionOperation } from './authoring';
import { applyAgentOperations } from './operations';

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
