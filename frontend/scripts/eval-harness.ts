import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { agentOperationSchema, applyAgentOperations } from '../lib/agent/operations';
import { agentFixtures, loadAgentFixture, type AgentFixtureId } from '../lib/fixtures';
import { behaviorReviewSchema, candidateDiff, proposalSchema } from '../lib/agent/proposals';
import type { AgentConfig } from '../lib/agent/schema';
import { minimalAgent } from '../lib/agent/repository';

const toolName = z.enum(['get_agent', 'propose_agent_patch', 'get_call', 'get_calls']);
export const evalFixtureSchema = z
  .object({
    id: z.string().min(1),
    agent_id: z.union([z.enum(Object.keys(agentFixtures) as AgentFixtureId[]), z.literal('new-agent')]),
    prompt: z.string().min(1),
    // Repo-relative text appended to the prompt, e.g. a pasted SOP.
    prompt_file: z.string().min(1).optional(),
    intent: z.enum(['chat', 'review']).optional(),
    live_only: z.boolean().optional(),
    expected: z
      .object({
        tools_in_order: z.array(toolName).min(1),
        operations: z.array(agentOperationSchema).optional(),
        changed_nodes: z.array(z.string()).min(1).optional(),
        added_nodes: z.array(z.string()).min(1).optional(),
        // The patch must touch these nodes (it may touch others, unlike changed_nodes).
        patch_touches: z.array(z.string()).min(1).optional(),
        min_added_nodes: z.number().int().positive().optional(),
        requires_branch: z.literal(true).optional(),
        candidate_mentions: z.array(z.string().min(1)).min(1).optional(),
        // Calls Copilot must actually read, and transcript turns the answer must cite.
        must_read_calls: z.array(z.string()).min(1).optional(),
        answer_cites: z
          .array(
            z.object({ call_id: z.string(), turns: z.array(z.number().int().positive()).min(1) }).strict(),
          )
          .min(1)
          .optional(),
        requires_approval: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const evalTraceSchema = z
  .object({
    // Map observed SDK calls/results by toolCallId; never infer execution from prose.
    tool_calls: z.array(
      z
        .object({
          toolCallId: z.string().min(1),
          toolName,
          input: z.json(),
          result: z.discriminatedUnion('type', [
            z.object({ type: z.literal('tool-result'), output: z.json() }).strict(),
            z.object({ type: z.literal('tool-error'), error: z.string().min(1) }).strict(),
          ]),
        })
        .strict(),
    ),
    proposed_operations: z.array(agentOperationSchema),
    answer: z.string().optional(),
    applied: z.boolean(),
    review: behaviorReviewSchema.optional(),
  })
  .strict()
  .refine(
    trace => new Set(trace.tool_calls.map(call => call.toolCallId)).size === trace.tool_calls.length,
    'Duplicate toolCallId',
  );

export const liveEvalSchema = z
  .object({
    model: z
      .object({
        provider: z.string().min(1),
        id: z.string().min(1),
        settings: z.record(z.string(), z.json()),
      })
      .strict(),
    trace: evalTraceSchema,
  })
  .strict();

export type EvalFixture = z.infer<typeof evalFixtureSchema>;
export function loadEvalAgent(id: EvalFixture['agent_id']) {
  return id === 'new-agent' ? minimalAgent() : loadAgentFixture(id);
}
export type EvalTrace = z.infer<typeof evalTraceSchema>;
// The adapter must execute the real Copilot and capture its actions, not invent a trace.
export type EvalAdapter = (input: {
  prompt: string;
  agentId?: string;
  agent: AgentConfig;
  intent?: 'chat' | 'review';
  guidelines?: string;
}) => Promise<unknown>;

export function evaluate(fixture: EvalFixture, rawTrace: unknown): string[] {
  const parsed = evalTraceSchema.safeParse(rawTrace);
  if (!parsed.success) return [`Invalid trace: ${parsed.error.message}`];
  const trace = parsed.data;
  const failures: string[] = [];
  let cursor = 0;
  for (const tool of fixture.expected.tools_in_order) {
    const index = trace.tool_calls.findIndex((call, index) => index >= cursor && call.toolName === tool);
    if (index < 0) {
      failures.push(`Missing or out-of-order tool: ${tool}`);
      break;
    }
    cursor = index + 1;
  }
  for (const call of trace.tool_calls) {
    if (call.result.type === 'tool-error')
      failures.push(`Tool ${call.toolName} (${call.toolCallId}) failed: ${call.result.error}`);
  }
  if (
    fixture.expected.operations &&
    !isDeepStrictEqual(trace.proposed_operations, fixture.expected.operations)
  ) {
    failures.push(
      `Proposed operations differ: expected ${JSON.stringify(fixture.expected.operations)}, received ${JSON.stringify(trace.proposed_operations)}`,
    );
  }
  if (fixture.expected.requires_approval && trace.applied)
    failures.push('Changed the agent without approval');
  if (fixture.intent === 'review' && (!trace.review?.behaviors.length || trace.proposed_operations.length))
    failures.push('Review must provide grounded findings without a patch.');
  failures.push(...evidenceFailures(fixture, trace));
  const expectation = fixture.expected;
  if (
    expectation.changed_nodes ||
    expectation.added_nodes ||
    expectation.patch_touches ||
    expectation.min_added_nodes ||
    expectation.requires_branch ||
    expectation.candidate_mentions
  ) {
    const base = loadEvalAgent(fixture.agent_id);
    try {
      const candidate = applyAgentOperations(base, trace.proposed_operations);
      const diff = candidateDiff(base, candidate);
      if (
        fixture.expected.changed_nodes &&
        (!diff.length ||
          diff.some(
            change => !change.reference || !fixture.expected.changed_nodes!.includes(change.reference.node),
          ))
      )
        failures.push('Patch changed outside the requested nodes or made no change.');
      if (expectation.patch_touches) {
        const touched = new Set(diff.flatMap(change => (change.reference ? [change.reference.node] : [])));
        for (const name of expectation.patch_touches)
          if (!touched.has(name)) failures.push(`Patch did not change required node: ${name}`);
      }
      if (
        expectation.min_added_nodes &&
        candidate.nodes.length - base.nodes.length < expectation.min_added_nodes
      )
        failures.push(`Expected at least ${expectation.min_added_nodes} new steps.`);
      if (
        expectation.requires_branch &&
        !candidate.nodes.some(node => new Set(node.edges.map(edge => edge.target)).size > 1)
      )
        failures.push('Candidate has no branching step.');
      if (expectation.candidate_mentions) {
        const text = candidate.nodes
          .flatMap(node => [JSON.stringify(node.task_messages), ...node.edges.map(edge => edge.description)])
          .join('\n')
          .toLowerCase();
        for (const word of expectation.candidate_mentions)
          if (!text.includes(word.toLowerCase())) failures.push(`Candidate never mentions "${word}".`);
      }
      if (fixture.expected.added_nodes) {
        for (const name of fixture.expected.added_nodes) {
          if (
            base.nodes.some(node => node.name === name) ||
            !candidate.nodes.some(node => node.name === name)
          )
            failures.push(`Missing newly created step: ${name}`);
        }
        if (candidate.voice_id !== base.voice_id || candidate.model !== base.model)
          failures.push('Creation changed voice or model configuration.');
      }
      const outputs = trace.tool_calls.flatMap(call =>
        call.result.type === 'tool-result' &&
        call.toolName === 'propose_agent_patch' &&
        typeof call.result.output === 'object' &&
        call.result.output &&
        'proposal' in call.result.output
          ? [call.result.output.proposal]
          : [],
      );
      if (
        !outputs.some(output => {
          const parsed = proposalSchema.safeParse(output);
          return parsed.success && isDeepStrictEqual(parsed.data.candidate, candidate);
        })
      )
        failures.push('Missing Python-valid proposal matching the candidate.');
    } catch (error) {
      failures.push(String(error));
    }
  }
  try {
    applyAgentOperations(loadEvalAgent(fixture.agent_id), trace.proposed_operations);
  } catch (error) {
    failures.push(`Invalid proposed payload: ${String(error)}`);
  }
  return failures;
}

const citation = /\(call:([^#)\s]+)#(\d+)\)/g;
/** Reads and citations are judged only from observed tool results, never from prose claims. */
function evidenceFailures(fixture: EvalFixture, trace: EvalTrace): string[] {
  const failures: string[] = [];
  const readTurns = new Map<string, number>();
  for (const call of trace.tool_calls) {
    if (call.toolName !== 'get_call' || call.result.type !== 'tool-result') continue;
    const output = call.result.output;
    if (
      output &&
      typeof output === 'object' &&
      'id' in output &&
      'transcript' in output &&
      Array.isArray(output.transcript)
    )
      readTurns.set(String(output.id), output.transcript.length);
  }
  for (const id of fixture.expected.must_read_calls ?? [])
    if (!readTurns.has(id)) failures.push(`Never read call transcript: ${id}`);
  const cited = [...(trace.answer ?? '').matchAll(citation)].map(match => ({
    callId: match[1],
    turn: Number(match[2]),
  }));
  for (const { callId, turn } of cited)
    if (turn < 1 || turn > (readTurns.get(callId) ?? 0))
      failures.push(`Invented citation: ${callId} turn ${turn}`);
  for (const expected of fixture.expected.answer_cites ?? []) {
    if (!cited.some(item => item.callId === expected.call_id && expected.turns.includes(item.turn)))
      failures.push(`Answer does not cite ${expected.call_id} turn ${expected.turns.join(' or ')}`);
  }
  return failures;
}
