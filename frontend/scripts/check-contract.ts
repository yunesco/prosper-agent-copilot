import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { agentFixtures } from '../lib/fixtures';
import { editCollectedField } from '../lib/agent/collected-fields';
import { createStepOperations } from '../lib/agent/authoring';
import { applyAgentOperations } from '../lib/agent/operations';
import { loadAgentFixture } from '../lib/fixtures';
import { parseAgent } from '../lib/agent/schema';

const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const cases: { id: string; input: unknown; accepted: boolean }[] = [
  { id: 'visual-slot-schema', accepted: true, input: applyAgentOperations(loadAgentFixture('original-scheduler'), [{ type: 'update_edge', node: 'offer_times', function: 'select_time', changes: editCollectedField(loadAgentFixture('original-scheduler').nodes[2].edges[0], { originalKey: 'slot', key: 'slot', kind: 'choice', description: 'The chosen appointment slot.', options: ['Tuesday 10 AM', 'Thursday 2 PM'], required: true, error: '' }) }]) },
  ...Object.entries(agentFixtures).map(([id, input]) => ({ id, input, accepted: true })),
  { id: 'generated-step-identifiers', accepted: true, input: applyAgentOperations(loadAgentFixture('original-scheduler'), createStepOperations(loadAgentFixture('original-scheduler'), 'Collect insurance — تأمين', 'collect_details', true, 'The caller needs insurance help.', 'Ask for insurance.').operations) },
  { id: 'defaults', accepted: true, input: { name: 'Defaults', initial_node: 'start', nodes: [{ name: 'start', end: true }] } },
  { id: 'native-json-and-edge-defaults', accepted: true, input: {
    name: 'Native fields', persona: 'Global', voice_id: 'voice', model: 'gpt-4o', initial_node: 'end', nodes: [{
      name: 'end', role_message: 'Override', end: true,
      task_messages: [{ role: 'developer', content: 'Say goodbye', extra: { nested: [true, null, 1] } }],
      pre_actions: [{ type: 'tts_say', text: 'Hello' }], post_actions: [{ type: 'end_conversation' }],
      edges: [{ function: 'retry', description: 'Cycle', target: 'end' }],
    }],
  } },
  { id: 'edited-instructions-and-transition', accepted: true, input: applyAgentOperations(loadAgentFixture('original-scheduler'), [
    { type: 'update_node', node: 'collect_details', changes: { task_messages: [{ role: 'system', content: 'Collect name.', metadata: { native: [true, null] } }], role_message: 'Override' } },
    { type: 'update_edge', node: 'collect_details', function: 'record_details', changes: { description: 'Continue', target: 'offer_times' } },
  ]) },
  { id: 'unknown-wrapper-fields-stripped', accepted: true, input: {
    name: 'Unknown fields', initial_node: 'end', unknown_agent: 'discard', nodes: [{
      name: 'end', end: true, unknown_node: 'discard',
      edges: [{ function: 'retry', description: '', target: 'end', unknown_edge: 'discard',
        properties: { value: { type: 'string', custom: { nested: true } } } }],
    }],
  } },
  { id: 'empty-graph', accepted: false, input: { name: 'Empty', initial_node: 'start', nodes: [] } },
  { id: 'unknown-initial', accepted: false, input: { name: 'Missing initial', initial_node: 'missing', nodes: [{ name: 'start', end: true }] } },
  { id: 'unknown-target', accepted: false, input: { name: 'Missing target', initial_node: 'start', nodes: [{ name: 'start', edges: [{ function: 'go', description: '', target: 'missing' }] }] } },
];
const resultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), agent: z.json() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
const actual = z.array(resultSchema).parse(JSON.parse(execFileSync(`${backend}.venv/bin/python`, ['tests/export_contract.py'], {
  cwd: backend,
  input: JSON.stringify(cases.map(item => item.input)),
  encoding: 'utf8',
  timeout: 30_000,
  env: { ...process.env, PYTHONPATH: backend },
})));
assert.equal(actual.length, cases.length, 'Python bridge returned the wrong number of results');
let failed = false;
for (const [index, item] of cases.entries()) {
  try {
    let expected;
    try { expected = { ok: true as const, agent: parseAgent(item.input) }; }
    catch (error) { expected = { ok: false as const, error: String(error) }; }
    const python = actual[index];
    assert.equal(expected.ok, item.accepted, `TypeScript acceptance: ${JSON.stringify(expected)}`);
    assert.equal(python.ok, item.accepted, `Python acceptance: ${JSON.stringify(python)}`);
    if (expected.ok && python.ok) {
      // Compare Python JSON directly: re-parsing it with Zod could hide drift.
      assert.deepEqual(python.agent, expected.agent, 'Normalized wire JSON differs');
      assert.deepEqual(parseAgent(python.agent), expected.agent, 'Python → TypeScript round trip differs');
    }
    console.log(`PASS contract ${item.id}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL contract ${item.id}`);
    console.error(error); // Keep assertion actual/expected and stack, not just its message.
  }
}
if (failed) process.exitCode = 1;
else console.log(`Contract parity: ${cases.length} cases passed against the real Python builder.`);
