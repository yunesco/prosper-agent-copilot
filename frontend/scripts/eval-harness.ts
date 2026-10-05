import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { agentOperationSchema, applyAgentOperations } from '../lib/agent/operations';
import { agentFixtures, loadAgentFixture, type AgentFixtureId } from '../lib/fixtures';
import type { AgentConfig } from '../lib/agent/schema';

const toolName = z.enum(['get_agent', 'propose_agent_patch', 'validate_agent', 'get_call', 'get_calls']);
export const evalFixtureSchema = z.object({
  id: z.string().min(1),
  agent_id: z.enum(Object.keys(agentFixtures) as AgentFixtureId[]),
  prompt: z.string().min(1),
  expected: z.object({
    tools_in_order: z.array(toolName).min(1),
    operations: z.array(agentOperationSchema).min(1),
    requires_approval: z.literal(true),
  }).strict(),
}).strict();

export const evalTraceSchema = z.object({
  // Map observed SDK calls/results by toolCallId; never infer execution from prose.
  tool_calls: z.array(z.object({
    toolCallId: z.string().min(1),
    toolName,
    input: z.json(),
    result: z.discriminatedUnion('type', [
      z.object({ type: z.literal('tool-result'), output: z.json() }).strict(),
      z.object({ type: z.literal('tool-error'), error: z.string().min(1) }).strict(),
    ]),
  }).strict()),
  proposed_operations: z.array(agentOperationSchema),
  applied: z.boolean(),
}).strict().refine(trace => new Set(trace.tool_calls.map(call => call.toolCallId)).size === trace.tool_calls.length,
  'Duplicate toolCallId');

export const liveEvalSchema = z.object({
  model: z.object({
    provider: z.string().min(1), id: z.string().min(1), settings: z.record(z.string(), z.json()),
  }).strict(),
  trace: evalTraceSchema,
}).strict();

export type EvalFixture = z.infer<typeof evalFixtureSchema>;
export type EvalTrace = z.infer<typeof evalTraceSchema>;
// A future adapter must execute the real Copilot and capture its actions, not invent a trace.
export type EvalAdapter = (input: { prompt: string; agent: AgentConfig }) => Promise<unknown>;

export function evaluate(fixture: EvalFixture, rawTrace: unknown): string[] {
  const parsed = evalTraceSchema.safeParse(rawTrace);
  if (!parsed.success) return [`Invalid trace: ${parsed.error.message}`];
  const trace = parsed.data;
  const failures: string[] = [];
  let cursor = 0;
  for (const tool of fixture.expected.tools_in_order) {
    const index = trace.tool_calls.findIndex((call, index) => index >= cursor && call.toolName === tool);
    if (index < 0) { failures.push(`Missing or out-of-order tool: ${tool}`); break; }
    cursor = index + 1;
  }
  for (const call of trace.tool_calls) {
    if (call.result.type === 'tool-error') failures.push(`Tool ${call.toolName} (${call.toolCallId}) failed: ${call.result.error}`);
  }
  if (!isDeepStrictEqual(trace.proposed_operations, fixture.expected.operations)) {
    failures.push(`Proposed operations differ: expected ${JSON.stringify(fixture.expected.operations)}, received ${JSON.stringify(trace.proposed_operations)}`);
  }
  if (fixture.expected.requires_approval && trace.applied) failures.push('Changed the agent without approval');
  try { applyAgentOperations(loadAgentFixture(fixture.agent_id), trace.proposed_operations); }
  catch (error) { failures.push(`Invalid proposed payload: ${String(error)}`); }
  return failures;
}
