import { expect, test } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { instructions } from '@/lib/copilot/server';
import { conversationQualityIssues } from './conversation-quality';
import { applyAgentOperations } from './operations';
import type { AgentConfig } from './schema';

const clinic = loadAgentFixture('clinic-scheduler');

test('the deployed scheduler cannot leave intake without name, date of birth and patient type', () => {
  expect(conversationQualityIssues(clinic)).toEqual([]);
  const intake = clinic.nodes.find(node => node.name === 'collect_details')!.edges[0];
  expect(intake.required).toEqual(expect.arrayContaining(['full_name', 'date_of_birth', 'patient_type']));
  // Insurance stays optional on the transition: existing patients skip it.
  expect(intake.required).not.toContain('insurance_provider');
});

test('flags a step that collects information but lets the call advance with nothing collected', () => {
  const loose = applyAgentOperations(clinic, [
    {
      type: 'update_edge',
      node: 'collect_details',
      function: 'record_details',
      changes: { required: [] },
    },
  ]);
  expect(conversationQualityIssues(loose)).toEqual([
    expect.stringContaining('collect_details: transition record_details can fire without collecting'),
  ]);
});

test('flags a field that is required again downstream', () => {
  const repeated = applyAgentOperations(clinic, [
    {
      type: 'update_edge',
      node: 'offer_times',
      function: 'select_time',
      changes: {
        properties: { slot: { type: 'string' }, full_name: { type: 'string' } },
        required: ['slot', 'full_name'],
      },
    },
  ]);
  expect(conversationQualityIssues(repeated)).toEqual([
    'Step offer_times: select_time asks for full_name again; it was collected in collect_details.',
  ]);
});

test('routing steps that collect nothing and loops back to an earlier step are not flagged', () => {
  const agent: AgentConfig = {
    ...clinic,
    nodes: [
      {
        ...clinic.nodes[0],
        task_messages: [{ role: 'developer', content: 'Greet the caller.' }],
        edges: [{ ...clinic.nodes[0].edges[0], required: [], properties: {} }],
      },
      {
        ...clinic.nodes[1],
        edges: [
          ...clinic.nodes[1].edges,
          { ...clinic.nodes[1].edges[0], function: 'back', target: 'collect_details' },
        ],
      },
      clinic.nodes[2],
    ],
  };
  expect(conversationQualityIssues(agent)).toEqual([]);
});

// The model decides how to word the graph, so the contract it is given is the owning boundary for
// short answers, corrections and early information. A reworded prompt must not silently drop one.
test.each([
  ['asks for missing information', /collect missing information/i],
  ['clarifies ambiguous answers', /clarify ambiguous answers/i],
  ['accepts short valid answers', /accept valid short answers/i],
  ['honors corrections', /corrections/i],
  ['remembers information given earlier', /remember information supplied earlier/i],
  ['does not advance without required answers', /do not advance before required answers are available/i],
  ['states eligibility rules in the instructions', /eligibility rules in the instructions/i],
  ['forbids invented placeholders', /never write placeholders/i],
])('Copilot instructions require that generated agents %s', (_, pattern) => {
  expect(instructions).toMatch(pattern);
});
