import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import fixtureData from '../../evals/fixtures/rename-agent.json';
import traceData from '../../evals/traces/rename-agent.json';
import { evalFixtureSchema, evaluate } from './eval-harness';

const fixture = evalFixtureSchema.parse(fixtureData);

test('accepts the synthetic reference trace', () => {
  expect(evaluate(fixture, traceData)).toEqual([]);
});

test.each([
  { ...traceData, applied: true },
  { ...traceData, tool_calls: [traceData.tool_calls[1], traceData.tool_calls[0]] },
  { ...traceData, tool_calls: traceData.tool_calls.slice(0, 1) },
  { ...traceData, tool_calls: [...traceData.tool_calls, traceData.tool_calls[0]] },
  { ...traceData, tool_calls: [{ ...traceData.tool_calls[0], result: undefined }] },
  { ...traceData, proposed_operations: [{ type: 'update_agent', changes: { name: 'Wrong agent' } }] },
  { ...traceData, proposed_operations: [{ type: 'delete_node', name: 'greeting' }] },
  { ...traceData, proposed_operations: [] },
])('fails an unsafe, incomplete or incorrect trace', trace => {
  expect(evaluate(fixture, trace).length).toBeGreaterThan(0);
});

test('reports tool execution failures with the call identity and reason', () => {
  const tool_calls = traceData.tool_calls.map(call =>
    call.toolName === 'propose_agent_patch'
      ? { ...call, result: { type: 'tool-error', error: 'Runtime unavailable' } }
      : call,
  );
  expect(evaluate(fixture, { ...traceData, tool_calls })).toContain(
    'Tool propose_agent_patch (synthetic-2) failed: Runtime unavailable',
  );
});

test('rejects a fixture referencing an unknown agent', () => {
  expect(() => evalFixtureSchema.parse({ ...fixtureData, agent_id: 'missing' })).toThrow();
});

test('the live command fails explicitly without credentials', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/run-evals.ts', '--live'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, COPILOT_EVAL_ADAPTER: '', OPENAI_API_KEY: '' },
    encoding: 'utf8',
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('No live eval was run.');
});

import creationData from '../../evals/fixtures/sop-create-agent.json';
import { loadEvalAgent } from './eval-harness';
import { constructProposal } from '../lib/agent/proposals';
import { nodeSchema } from '../lib/agent/schema';

test('fresh-agent creation scores added steps and requires an exact validated candidate', async () => {
  const creation = evalFixtureSchema.parse(creationData);
  const base = { id: 'eval-agent', revision: 1, guidelines: '', agent: loadEvalAgent(creation.agent_id) };
  expect(base.agent.nodes).toHaveLength(1);
  expect(base.agent.initial_node).toBe('start');
  const proposal = await constructProposal(
    base,
    {
      agentId: base.id,
      baseRevision: 1,
      outcome: 'Create',
      explanation: 'SOP',
      behavior: 'Scheduling',
      operations: creation.expected.added_nodes!.map(name => ({
        type: 'add_node',
        value: nodeSchema.parse({ name, end: true }),
      })),
    },
    async () => {},
  );
  // This fake checks the scorer only; it does not establish graph or voice quality.
  const trace = {
    applied: false,
    proposed_operations: proposal.operations,
    tool_calls: [
      { toolCallId: 'read', toolName: 'get_agent', input: {}, result: { type: 'tool-result', output: base } },
      {
        toolCallId: 'create',
        toolName: 'propose_agent_patch',
        input: {},
        result: { type: 'tool-result', output: { valid: true, proposal } },
      },
    ],
  };
  expect(evaluate(creation, trace)).toEqual([]);
  expect(evaluate(creation, { ...trace, proposed_operations: [] })).toContain(
    'Missing newly created step: collect_insurance',
  );
  const mismatched = structuredClone(trace);
  mismatched.proposed_operations.push({
    type: 'update_agent',
    changes: { name: 'Different from reviewed candidate' },
  });
  expect(evaluate(creation, mismatched)).toContain('Missing Python-valid proposal matching the candidate.');
});

test('conversation_quality fails a generated candidate that can advance before collecting anything', async () => {
  const creation = evalFixtureSchema.parse({
    ...creationData,
    expected: { ...creationData.expected, conversation_quality: true },
  });
  const base = { id: 'eval-agent', revision: 1, guidelines: '', agent: loadEvalAgent(creation.agent_id) };
  const operations = [
    ...creation.expected.added_nodes!.map(name => ({
      type: 'add_node' as const,
      value: nodeSchema.parse({ name, end: true }),
    })),
    {
      type: 'update_node' as const,
      node: 'start',
      changes: { task_messages: [{ role: 'developer', content: 'Collect the caller name.' }] },
    },
    {
      type: 'add_edge' as const,
      node: 'start',
      value: {
        function: 'next',
        description: 'Continue.',
        target: 'offer_times',
        properties: {},
        required: [],
      },
    },
  ];
  const proposal = await constructProposal(
    base,
    { agentId: base.id, baseRevision: 1, outcome: 'Create', explanation: 'SOP', behavior: 'x', operations },
    async () => {},
  );
  const trace = {
    applied: false,
    proposed_operations: proposal.operations,
    tool_calls: [
      { toolCallId: 'read', toolName: 'get_agent', input: {}, result: { type: 'tool-result', output: base } },
      {
        toolCallId: 'create',
        toolName: 'propose_agent_patch',
        input: {},
        result: { type: 'tool-result', output: { valid: true, proposal } },
      },
    ],
  };
  expect(evaluate(creation, trace)).toEqual([
    expect.stringContaining('Step start: transition next can fire without collecting'),
  ]);
});

import diagnosisData from '../../evals/fixtures/friday-diagnosis.json';
import discoveryData from '../../evals/fixtures/discover-unflagged.json';
import { callSchema } from '../lib/platform/schema';
import { getCall } from '../lib/platform/store';

test('diagnosis scoring needs a real transcript read, honest citations, and a patch on the responsible node', async () => {
  const diagnosis = evalFixtureSchema.parse(diagnosisData);
  const base = {
    id: 'clinic-scheduler',
    revision: 1,
    guidelines: '',
    agent: loadEvalAgent(diagnosis.agent_id),
  };
  const call = getCall('clinic-scheduler', 'new-patient-friday');
  const readOutput = {
    ...call,
    transcript: call.transcript.map((turn, index) => ({ turn: index + 1, ...turn })),
  };
  expect(callSchema.safeParse(call).success).toBe(true);
  const proposal = await constructProposal(
    base,
    {
      agentId: base.id,
      baseRevision: 1,
      outcome: 'Restrict new patients',
      explanation: 'Friday is not allowed for new patients.',
      behavior: 'New patients only get Monday or Wednesday.',
      operations: [
        {
          type: 'update_node',
          node: 'offer_times',
          changes: {
            task_messages: [
              {
                role: 'developer',
                content:
                  'New patients: offer Monday at 10 AM or Wednesday at 2 PM only. Existing patients may also be offered Friday at 2 PM.',
              },
            ],
          },
        },
      ],
    },
    async () => {},
  );
  const result = (output: unknown) => ({ type: 'tool-result' as const, output: output as never });
  const trace = {
    applied: false,
    proposed_operations: proposal.operations,
    answer: 'The agent offered Friday to a new patient ([turn 3](call:new-patient-friday#3)).',
    tool_calls: [
      { toolCallId: 'a', toolName: 'get_agent' as const, input: {}, result: result(base) },
      {
        toolCallId: 'b',
        toolName: 'get_call' as const,
        input: { call_id: 'new-patient-friday' },
        result: result(readOutput),
      },
      {
        toolCallId: 'c',
        toolName: 'propose_agent_patch' as const,
        input: {},
        result: result({ valid: true, proposal }),
      },
    ],
  };
  expect(evaluate(diagnosis, trace)).toEqual([]);
  expect(evaluate(diagnosis, { ...trace, answer: 'It offered Friday.' })).toContain(
    'Answer does not cite new-patient-friday turn 3 or 4 or 5',
  );
  expect(
    evaluate(diagnosis, {
      ...trace,
      answer: '[turn 9](call:new-patient-friday#9) and [turn 3](call:new-patient-friday#3)',
    }),
  ).toContain('Invented citation: new-patient-friday turn 9');
  expect(
    evaluate(diagnosis, {
      ...trace,
      tool_calls: trace.tool_calls.filter(item => item.toolName !== 'get_call'),
    }),
  ).toEqual(expect.arrayContaining(['Never read call transcript: new-patient-friday']));
  expect(evaluate(diagnosis, { ...trace, answer: '[turn 3](call:other-call#3)' }).join()).toContain(
    'Invented citation: other-call turn 3',
  );
  const discovery = evalFixtureSchema.parse(discoveryData);
  expect(discovery.expected.patch_touches).toEqual(['collect_details']);
  expect(evaluate(discovery, trace)).toEqual(
    expect.arrayContaining(['Patch did not change required node: collect_details']),
  );
});
