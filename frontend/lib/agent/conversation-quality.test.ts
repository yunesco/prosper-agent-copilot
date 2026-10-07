import { expect, test } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { instructions } from '@/lib/copilot/server';
import { conversationQualityIssues, hardcodedTimeIssues, sizeIssues } from './conversation-quality';
import { applyAgentOperations } from './operations';
import { parseAgent, type AgentConfig } from './schema';

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
        properties: { slot: { type: 'string', enum: ['Monday'] }, full_name: { type: 'string' } },
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
  ['constrains closed-set values with enums', /enum of the exact option texts/i],
  ['gives each eligibility class its own enum', /eligibility class its own transition/i],
  [
    'treats quality warnings as hints, never a reason to add parts',
    /never add steps or transitions just to silence it/i,
  ],
  ['designs from the happy path and names a step limit', /happy path[\s\S]*never more than 8/i],
  ['keeps transitions few', /never more than three/i],
  ['puts whole-call rules once in the persona', /live once in the agent's persona/i],
  ['keeps side cases out of the graph', /Side cases are not steps/i],
  ['never re-collects an earlier field on a later transition', /never require it again as a property/i],
])('Copilot instructions require that generated agents %s', (_, pattern) => {
  expect(instructions).toMatch(pattern);
});

test('flags a restricted choice that is collected as free text, and accepts an enum', () => {
  const restricted = (properties: Record<string, string | string[]>) =>
    applyAgentOperations(clinic, [
      {
        type: 'update_node',
        node: 'offer_times',
        changes: {
          task_messages: [
            {
              role: 'developer',
              content: 'Offer only Monday or Friday. The caller must choose one.',
            },
          ],
        },
      },
      {
        type: 'update_edge',
        node: 'offer_times',
        function: 'select_time',
        changes: { properties: { slot: properties }, required: ['slot'] },
      },
    ]);
  expect(conversationQualityIssues(restricted({ type: 'string' }))).toEqual([
    expect.stringContaining('offer_times: select_time collects slot as free text'),
  ]);
  expect(conversationQualityIssues(restricted({ type: 'string', enum: ['Monday', 'Friday'] }))).toEqual([]);
});

test('flags a step that is a dead end and a loop that can never end the call', () => {
  const stuck = applyAgentOperations(clinic, [
    { type: 'update_node', node: 'confirm', changes: { end: false } },
  ]);
  expect(conversationQualityIssues(stuck)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Step confirm has no transition and does not end the call'),
    ]),
  );
  const loop = applyAgentOperations(clinic, [
    {
      type: 'update_edge',
      node: 'offer_times',
      function: 'select_time',
      changes: { target: 'collect_details' },
    },
  ]);
  expect(conversationQualityIssues(loop)).toEqual(
    expect.arrayContaining([expect.stringContaining('cannot reach any step that ends the call')]),
  );
});

test('escape routes (exit to an end step, correction back to an earlier step) are not flagged as under-collecting or re-asking', () => {
  const withEscapes = applyAgentOperations(clinic, [
    {
      type: 'add_edge',
      node: 'offer_times',
      value: {
        function: 'caller_cancels',
        description: 'Caller cancels.',
        target: 'confirm',
        properties: {},
        required: [],
      },
    },
    {
      type: 'add_edge',
      node: 'offer_times',
      value: {
        function: 'corrected_details',
        description: 'Caller corrects their details.',
        target: 'collect_details',
        properties: { patient_type: { type: 'string', enum: ['new', 'existing'] } },
        required: ['patient_type'],
      },
    },
  ]);
  expect(conversationQualityIssues(withEscapes)).toEqual([]);
});

test('a plain "only" in step text does not demand an enum, but an offer-only restriction does', () => {
  const insurance = applyAgentOperations(clinic, [
    {
      type: 'update_node',
      node: 'offer_times',
      changes: {
        task_messages: [
          {
            role: 'developer',
            content: 'Insurance is required for new patients only. Collect the provider.',
          },
        ],
      },
    },
    {
      type: 'update_edge',
      node: 'offer_times',
      function: 'select_time',
      changes: { properties: { provider: { type: 'string' } }, required: ['provider'] },
    },
  ]);
  expect(conversationQualityIssues(insurance)).toEqual([]);
});

test('a graph that is bigger than a phone call needs is flagged, a lean one is not', () => {
  const node = (name: string, targets: string[]) => ({
    name,
    task_messages: [{ role: 'developer' as const, content: 'Do the step.' }],
    edges: targets.map((target, index) => ({
      function: `${name}_${index}`,
      description: 'When done.',
      target,
      properties: { value: { type: 'string' as const } },
      required: ['value'],
    })),
    ...(targets.length ? {} : { end: true }),
  });
  const agent = (nodes: ReturnType<typeof node>[]) =>
    parseAgent({ name: 'Size test', initial_node: nodes[0].name, nodes });
  const lean = agent([node('a', ['b']), node('b', ['c', 'end']), node('c', ['end']), node('end', [])]);
  expect(sizeIssues(lean)).toEqual([]);
  const wide = agent([
    node('a', ['b', 'c', 'end', 'b']),
    node('b', ['end']),
    node('c', ['end']),
    node('end', []),
  ]);
  expect(sizeIssues(wide)).toEqual([expect.stringMatching(/Step a has 4 transitions; keep at most 3/)]);
  const long = agent([
    ...Array.from({ length: 9 }, (_, index) => node(`s${index}`, [`s${index + 1}`])),
    node('s9', []),
  ]);
  expect(sizeIssues(long)).toEqual([expect.stringMatching(/The graph has 10 steps; most calls need 3 to 6/)]);
  expect(conversationQualityIssues(long).some(issue => issue.includes('10 steps'))).toBe(true);
});

test('warns when a clock time is written into the persona, a step or an enum instead of coming from a tool', () => {
  const agent = loadAgentFixture('riverside-family-clinic');
  expect(hardcodedTimeIssues(agent)).toEqual([]);
  const withTime = applyAgentOperations(agent, [
    {
      type: 'update_node',
      node: 'offer_new_patient_times',
      changes: {
        task_messages: [{ role: 'developer', content: 'Offer Monday at 10 AM or Wednesday at 2 PM.' }],
      },
    },
  ]);
  expect(conversationQualityIssues(withTime)).toEqual([
    expect.stringContaining('offer_new_patient_times quotes a clock time'),
  ]);
  // The shipped demo agent is clean: a greeting that says "do not ask for it again" is not collecting.
  expect(conversationQualityIssues(agent)).toEqual([]);
  // Days are policy, not availability; "am"/"pm" inside other words and plain numbers are not times.
  const policy = applyAgentOperations(agent, [
    {
      type: 'update_node',
      node: 'offer_new_patient_times',
      changes: {
        task_messages: [
          {
            role: 'developer',
            content:
              'New patients may only book Monday or Wednesday; call 2 times if needed, then pamper them.',
          },
        ],
      },
    },
  ]);
  expect(hardcodedTimeIssues(policy)).toEqual([]);
});
