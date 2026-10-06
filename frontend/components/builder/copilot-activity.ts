import { isToolUIPart, type UIMessage } from 'ai';
import { FileSearch, ListTree, PhoneCall, ShieldCheck } from 'lucide-react';
import type { ChatActivity } from '@/components/chat/ActivityDrawer';

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
