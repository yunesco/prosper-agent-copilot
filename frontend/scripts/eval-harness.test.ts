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
  const tool_calls = traceData.tool_calls.map(call => call.toolName === 'propose_agent_patch'
    ? { ...call, result: { type: 'tool-error', error: 'Runtime unavailable' } } : call);
  expect(evaluate(fixture, { ...traceData, tool_calls })).toContain(
    'Tool propose_agent_patch (synthetic-2) failed: Runtime unavailable',
  );
});

test('rejects a fixture referencing an unknown agent', () => {
  expect(() => evalFixtureSchema.parse({ ...fixtureData, agent_id: 'missing' })).toThrow();
});

test('the live command fails explicitly when no Copilot adapter exists', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/run-evals.ts', '--live'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, COPILOT_EVAL_ADAPTER: '' },
    encoding: 'utf8',
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('No live eval was run.');
});
