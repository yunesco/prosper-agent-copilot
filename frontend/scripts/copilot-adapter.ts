import { startCopilot, reviewBehavior, parseCopilotRequest } from '../lib/copilot/server';
import { proposalSchema } from '../lib/agent/proposals';
import type { EvalAdapter, EvalTrace } from './eval-harness';

/** Capture actual SDK calls/results; never derive evidence from model prose. */
export const run: EvalAdapter = async ({
  prompt,
  history = [],
  agentId = 'eval-agent',
  agent,
  intent = 'chat',
  guidelines = '',
}) => {
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY. No live eval was run.');
  const input = await parseCopilotRequest({
    snapshot: { id: agentId, revision: 1, agent, guidelines },
    intent,
    messages: [
      ...history.map((turn, index) => ({
        id: `history-${index}`,
        role: turn.role,
        parts: [{ type: 'text', text: turn.text }],
      })),
      { id: 'user', role: 'user', parts: [{ type: 'text', text: prompt }] },
    ],
  });
  const trace: EvalTrace = { tool_calls: [], proposed_operations: [], applied: false };
  let steps;
  if (intent === 'review') {
    const result = await reviewBehavior(input);
    trace.review = result.review;
    steps = result.steps;
  } else {
    const result = await startCopilot(input);
    await result.consumeStream();
    steps = await result.steps;
    // `result.text` is the final step only; the chat shows every step's text.
    trace.answer = steps
      .map(step => step.text)
      .filter(Boolean)
      .join('\n\n');
  }
  for (const step of steps)
    for (const call of step.toolCalls) {
      const name = (['get_agent', 'get_calls', 'get_call', 'propose_agent_patch'] as const).find(
        item => item === call.toolName,
      );
      if (!name) continue;
      const output = step.toolResults.find(item => item.toolCallId === call.toolCallId);
      const failure = step.content.find(
        part => part.type === 'tool-error' && part.toolCallId === call.toolCallId,
      );
      trace.tool_calls.push({
        toolCallId: call.toolCallId,
        toolName: name,
        input: JSON.parse(JSON.stringify(call.input)),
        result: output
          ? { type: 'tool-result', output: JSON.parse(JSON.stringify(output.output)) }
          : {
              type: 'tool-error',
              error:
                failure && 'error' in failure
                  ? String(failure.error instanceof Error ? failure.error.message : failure.error)
                  : 'No tool result',
            },
      });
      if (output && typeof output.output === 'object' && output.output && 'proposal' in output.output) {
        const proposal = proposalSchema.parse(output.output.proposal);
        trace.proposed_operations = proposal.operations;
        trace.proposed_guidelines = proposal.guidelines;
      }
    }
  return { model: { provider: 'openai', id: process.env.COPILOT_MODEL || 'gpt-5.5', settings: {} }, trace };
};
