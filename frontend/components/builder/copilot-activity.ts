import { isToolUIPart, type UIMessage } from 'ai';
import { FileSearch, ListTree, PhoneCall, ShieldCheck } from 'lucide-react';
import type { ChatActivity } from '@/components/chat/WorkBlock';

const tools: Record<string, Pick<ChatActivity, 'label' | 'icon'>> = {
  get_agent: { label: 'Read saved agent', icon: FileSearch },
  get_calls: { label: 'Read recent calls', icon: ListTree },
  get_call: { label: 'Read call transcript', icon: PhoneCall },
  propose_agent_patch: { label: 'Validate proposal', icon: ShieldCheck },
};

const outcomes = {
  completed: 'Tool finished.',
  pending: 'Tool running…',
  interrupted: 'Tool interrupted before completion.',
} as const;

/** One drawer entry per tool call in the conversation, derived from AI SDK tool parts. */
export function copilotActivities(messages: UIMessage[], live: boolean): ChatActivity[] {
  return messages.flatMap(message =>
    message.parts.flatMap(part => {
      if (!isToolUIPart(part)) return [];
      const name = part.type === 'dynamic-tool' ? part.toolName : part.type.slice(5);
      const complete = part.state === 'output-available';
      const running = live && message === messages.at(-1);
      const output =
        complete && 'output' in part && typeof part.output === 'object' && part.output ? part.output : null;
      const failed =
        part.state === 'output-error' ||
        !!(output && ('error' in output || ('valid' in output && output.valid === false)));
      const status: ChatActivity['status'] = failed
        ? 'failed'
        : complete
          ? 'completed'
          : running
            ? 'pending'
            : 'interrupted';
      const detail =
        part.state === 'output-error'
          ? part.errorText
          : output && 'error' in output
            ? String(output.error)
            : status === 'failed'
              ? 'The proposal could not be validated.'
              : outcomes[status];
      return [{ id: part.toolCallId, ...(tools[name] ?? tools.propose_agent_patch), status, detail }];
    }),
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const toolName = (part: Parameters<typeof isToolUIPart>[0] & { type: string }) =>
  part.type === 'dynamic-tool' ? (part as { toolName: string }).toolName : part.type.slice(5);

/**
 * What the Copilot is doing right now, read from the last assistant message. Every label is backed by a
 * real stream event: nothing here is a guess about the model's thinking.
 */
export function copilotPhase(messages: UIMessage[], intent: 'chat' | 'review' = 'chat'): string {
  if (intent === 'review') return 'Comparing the guidelines with your agent…';
  const last = messages.at(-1);
  if (last?.role !== 'assistant') return 'Thinking…';
  const parts = last.parts.filter(part => isToolUIPart(part) || (part.type === 'text' && part.text.trim()));
  const part = parts.at(-1);
  if (!part) return 'Thinking…';
  if (part.type === 'text') return 'Writing the summary…';
  if (!isToolUIPart(part)) return 'Thinking…';
  const name = toolName(part);
  if (name === 'propose_agent_patch') {
    const attempt = parts.filter(
      item => isToolUIPart(item) && toolName(item) === 'propose_agent_patch',
    ).length;
    const retry = attempt > 1 ? ` (attempt ${attempt})` : '';
    if (part.state === 'input-streaming') {
      // The last entry may still be partial, so only entries followed by another one are counted.
      const operations =
        isRecord(part.input) && Array.isArray(part.input.operations) ? part.input.operations : [];
      const steps = operations
        .slice(0, -1)
        .filter(operation => isRecord(operation) && operation.type === 'add_node').length;
      return `${attempt > 1 ? 'Rewriting' : 'Writing'} the graph${retry}…${steps ? ` ${steps} step${steps === 1 ? '' : 's'}` : ''}`;
    }
    if (part.state === 'input-available') return `Checking with the validator${retry}…`;
    const output = part.state === 'output-available' && isRecord(part.output) ? part.output : null;
    return output?.valid === false ? 'Fixing the proposal…' : 'Writing the summary…';
  }
  if (part.state === 'output-available' || part.state === 'output-error') return 'Thinking…';
  if (name === 'get_agent') return 'Reading your agent…';
  return 'Reading call transcripts…';
}
