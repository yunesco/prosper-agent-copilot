import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { copilotTools, parseCopilotRequest } from './server';
import { loadAgentFixture } from '../fixtures';
import { reviewContentSchema } from '../agent/proposals';
const snapshot = {
  id: 'test',
  revision: 3,
  agent: loadAgentFixture('clinic-scheduler'),
  guidelines: 'Saved guidelines',
};
const messages = [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'Change insurance' }] }];
const options = { toolCallId: 'test', messages: [], context: {} };
test('parses SDK messages, rejects malformed requests and unsaved graph context', async () => {
  expect((await parseCopilotRequest({ snapshot, messages, intent: 'chat' })).snapshot).toEqual(snapshot);
  for (const input of [
    {},
    { snapshot, messages: [{ role: 'user' }], intent: 'chat' },
    { snapshot, messages, intent: 'chat', selected: { kind: 'node', node: 'draft-only' } },
    { snapshot: { ...snapshot, guidelines: '' }, messages, intent: 'review' },
  ])
    await expect(parseCopilotRequest(input)).rejects.toThrow();
});
test('tools read only captured saved context; review has no patch capability; errors permit valid correction', async () => {
  const validate = vi.fn(async () => {});
  const tools = copilotTools(snapshot, 'chat', validate);
  const read = await tools.get_agent.execute!({}, options);
  expect(read).toEqual(snapshot);
  expect(read).not.toBe(snapshot);
  expect(Object.keys(copilotTools(snapshot, 'review'))).toEqual(['get_agent']);
  const input = {
    agentId: 'test',
    baseRevision: 3,
    outcome: 'Rename',
    explanation: 'Requested',
    behavior: 'Label',
    operations: [{ type: 'delete_node', node: 'unknown' }],
  };
  expect(await tools.propose_agent_patch.execute!(input, options)).toMatchObject({ valid: false });
  const correction = { ...input, operations: [{ type: 'update_agent', changes: { name: 'Corrected' } }] };
  validate.mockRejectedValueOnce(new Error('Python unavailable'));
  expect(await tools.propose_agent_patch.execute!(correction, options)).toMatchObject({
    valid: false,
    error: 'Python unavailable',
  });
  expect(await tools.propose_agent_patch.execute!(correction, options)).toMatchObject({
    valid: true,
    proposal: { baseRevision: 3, candidate: { name: 'Corrected' } },
  });
  expect(snapshot.agent.name).toBe('Riverside Clinic Scheduler');
});
test('call tools expose only the active agent’s calls with numbered turns and fail closed otherwise', async () => {
  const deployed = { ...snapshot, id: 'clinic-scheduler' };
  const tools = copilotTools(deployed, 'chat', vi.fn());
  expect(Object.keys(tools)).toEqual(['get_agent', 'get_calls', 'get_call', 'propose_agent_patch']);
  const list = (await tools.get_calls.execute!({}, options)) as { calls: { id: string; outcome: string }[] };
  expect(list.calls.map(call => call.id)).toContain('new-patient-friday');
  expect(JSON.stringify(list)).not.toContain('transcript');
  const failed = (await tools.get_calls.execute!({ outcome: 'failed' }, options)) as {
    calls: { id: string }[];
  };
  expect(failed.calls.map(call => call.id)).toEqual(['new-patient-friday']);
  const call = (await tools.get_call.execute!({ call_id: 'new-patient-friday' }, options)) as {
    transcript: { turn: number; text: string }[];
  };
  expect(call.transcript.map(turn => turn.turn)).toEqual([1, 2, 3, 4, 5]);
  expect(call.transcript[2].text).toContain('Friday');
  expect(await tools.get_call.execute!({ call_id: 'missing' }, options)).toEqual({
    error: 'Call not found for this agent.',
  });
  // The generated agent has no history, and a call ID from another agent is indistinguishable from a missing one.
  const generated = copilotTools(snapshot, 'chat', vi.fn());
  expect(await generated.get_calls.execute!({}, options)).toEqual({ calls: [] });
  expect(await generated.get_call.execute!({ call_id: 'new-patient-friday' }, options)).toEqual({
    error: 'Call not found for this agent.',
  });
});
test('review reference union uses OpenAI-supported anyOf, not oneOf', () => {
  // Live gpt-4o rejects discriminated-union oneOf in response_format.
  const schema = JSON.stringify(z.toJSONSchema(reviewContentSchema));
  expect(schema).not.toContain('"oneOf"');
  expect(schema).toContain('"anyOf"');
});

test('missing configuration returns readable HTTP error text for the AI SDK transport', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  try {
    const { POST } = await import('../../app/api/copilot/route');
    const response = await POST(
      new Request('http://localhost/api/copilot', {
        method: 'POST',
        body: JSON.stringify({ snapshot, messages, intent: 'chat' }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(
      'Copilot is not configured. Set OPENAI_API_KEY in backend/.env and restart the web server.',
    );
    expect(response.headers.get('Content-Type')).toContain('text/plain');
  } finally {
    vi.unstubAllEnvs();
  }
});

// Exercise the real SDK/tool loop with injected model responses and validation.
import { MockLanguageModelV3 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { startCopilot } from './server';
import { LocalAgentRepository } from '../agent/repository';
import { nodeSchema } from '../agent/schema';
import { proposalSchema } from '../agent/proposals';

function modelStep(parts: LanguageModelV3StreamPart[], tools = true) {
  return {
    stream: simulateReadableStream<LanguageModelV3StreamPart>({
      chunks: [
        { type: 'stream-start', warnings: [] },
        ...parts,
        {
          type: 'finish',
          finishReason: { unified: tools ? 'tool-calls' : 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
        },
      ],
      initialDelayInMs: null,
      chunkDelayInMs: null,
    }),
  };
}
async function creationContext() {
  let stored: string | null = null;
  const write = vi.fn((_: string, value: string) => {
    stored = value;
  });
  const repository = new LocalAgentRepository(
    () => ({ getItem: () => stored, setItem: write }),
    async () => {},
    () => 'new-agent',
  );
  const doc = await repository.initialize();
  const base = doc.agents[0];
  write.mockClear();
  const node = (name: string, content: string, end = false) =>
    nodeSchema.parse({ name, end, task_messages: [{ role: 'system', content }] });
  const patch = {
    agentId: base.id,
    baseRevision: base.revision,
    outcome: 'Build the clinic scheduling workflow',
    explanation: 'Implement the supplied SOP.',
    behavior: 'Collect patient details, branch by patient type, schedule and confirm.',
    operations: [
      {
        type: 'update_node',
        node: 'start',
        changes: {
          end: false,
          task_messages: [
            {
              role: 'system',
              content: 'Collect name, DOB and patient type. Clarify missing or ambiguous answers.',
            },
          ],
        },
      },
      { type: 'add_node', value: node('insurance', 'Collect insurance only for new patients.') },
      {
        type: 'add_node',
        value: node(
          'schedule',
          'Offer simulated appointments. Dr. Smith sees new patients Monday and Wednesday only. Respect corrections.',
        ),
      },
      { type: 'add_node', value: node('confirm', 'Confirm the selected appointment and end.', true) },
      {
        type: 'add_edge',
        node: 'start',
        value: {
          function: 'new_patient',
          description: 'Patient is new and name and DOB are known.',
          target: 'insurance',
          properties: { name: { type: 'string' }, dob: { type: 'string' } },
          required: ['name', 'dob'],
        },
      },
      {
        type: 'add_edge',
        node: 'start',
        value: {
          function: 'existing_patient',
          description: 'Existing patient; name and DOB are known. Skip insurance.',
          target: 'schedule',
          properties: { name: { type: 'string' }, dob: { type: 'string' } },
          required: ['name', 'dob'],
        },
      },
      {
        type: 'add_edge',
        node: 'insurance',
        value: {
          function: 'insured',
          description: 'Insurance collected.',
          target: 'schedule',
          properties: {
            insurance: {
              type: 'string',
              examples: ['Synthetic health plan'],
              'x-native': { source: 'caller' },
            },
          },
          required: ['insurance'],
        },
      },
      {
        type: 'add_edge',
        node: 'schedule',
        value: {
          function: 'book',
          description: 'Caller selected an eligible appointment.',
          target: 'confirm',
          properties: { slot: { type: 'string' } },
          required: ['slot'],
        },
      },
    ],
  };
  return { base, repository, write, patch };
}

test('explicit SOP generation produces one full validated candidate without saving', async () => {
  const { base, repository, write, patch } = await creationContext();
  const before = structuredClone(base);
  const model = new MockLanguageModelV3({
    doStream: [
      modelStep([{ type: 'tool-call', toolCallId: 'read', toolName: 'get_agent', input: '{}' }]),
      modelStep([
        {
          type: 'tool-call',
          toolCallId: 'build',
          toolName: 'propose_agent_patch',
          input: JSON.stringify(patch),
        },
      ]),
      modelStep(
        [
          { type: 'text-start', id: 'summary' },
          { type: 'text-delta', id: 'summary', delta: 'Review the complete proposal before Apply.' },
          { type: 'text-end', id: 'summary' },
        ],
        false,
      ),
    ],
  });
  const validate = vi.fn(async () => {});
  const input = await parseCopilotRequest({
    snapshot: base,
    intent: 'chat',
    messages: [
      {
        id: 'u',
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'Build the complete agent from this SOP: collect name and DOB, new patients provide insurance, existing patients skip it. Offer eligible times; new patients see Dr. Smith Monday or Wednesday only. Confirm and end.',
          },
        ],
      },
    ],
  });
  const result = await startCopilot(input, { model, validate });
  await result.consumeStream();
  const steps = await result.steps;
  expect(model.doStreamCalls[0].toolChoice).toEqual({ type: 'tool', toolName: 'get_agent' });
  const system = model.doStreamCalls[0].prompt.find(message => message.role === 'system');
  expect(system?.content).toContain('complete workflow');
  expect(system?.content).not.toContain(
    'No call tools, call investigation, or full guideline-to-agent generation',
  );
  expect(steps.flatMap(step => step.toolCalls.map(call => call.toolName))).toEqual([
    'get_agent',
    'propose_agent_patch',
  ]);
  const output = steps[1].toolResults[0].output;
  expect(output).toMatchObject({ valid: true });
  const parsed = z.object({ proposal: proposalSchema }).parse(output).proposal;
  expect(parsed.candidate.nodes.map(node => node.name)).toEqual([
    'start',
    'insurance',
    'schedule',
    'confirm',
  ]);
  expect(parsed.candidate.nodes[1].edges[0].properties.insurance).toEqual({
    type: 'string',
    examples: ['Synthetic health plan'],
    'x-native': { source: 'caller' },
  });
  expect(parsed.candidate.voice_id).toBe(base.agent.voice_id);
  expect(parsed.candidate.model).toBe(base.agent.model);
  expect(validate).toHaveBeenCalledExactlyOnceWith(parsed.candidate);
  expect(base).toEqual(before);
  expect(await repository.getAgent(base.id)).toEqual(before);
  expect(write).not.toHaveBeenCalled();
});

test.each(['Python rejected unreachable step', 'Validation service unavailable'])(
  'full generation fails closed: %s',
  async error => {
    const { base, repository, write, patch } = await creationContext();
    const validate = vi.fn(async () => {
      throw new Error(error);
    });
    const tools = copilotTools(base, 'chat', validate);
    const output = await tools.propose_agent_patch.execute!(patch, options);
    expect(output).toEqual({ valid: false, error });
    expect(validate).toHaveBeenCalledOnce();
    expect(await repository.getAgent(base.id)).toEqual(base);
    expect(write).not.toHaveBeenCalled();
  },
);
