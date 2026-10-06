'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { behaviorReviewSchema, proposalSchema, type GraphReference } from '@/lib/agent/proposals';
import type { SavedAgent } from '@/lib/agent/repository';

const proposalResult = z.object({ valid: z.literal(true), proposal: proposalSchema });
export function useCopilot(record: SavedAgent, selected: GraphReference | null) {
  const [completed, setCompleted] = useState<string[]>([]);
  const [closed, setClosed] = useState<Partial<Record<string, 'Dismissed' | 'Applied' | 'Superseded'>>>({});
  const [bases, setBases] = useState<Record<number, SavedAgent>>({});
  const [stopped, setStopped] = useState(false);
  const lastRequest = useRef<{ text: string; intent: 'chat' | 'review' } | null>(null);
  useEffect(() => {
    lastRequest.current = null;
  }, [record.id]);
  const request = useRef<{ revision: number; valid: boolean } | null>(null);
  const chat = useChat({
    transport: new DefaultChatTransport({ api: '/api/copilot' }),
    onFinish: ({ message, isAbort, isError, isDisconnect }) => {
      if (!isAbort && !isError && !isDisconnect && request.current?.valid)
        setCompleted(current => [...current, message.id]);
    },
  });
  const { stop } = chat;
  useEffect(() => {
    return () => {
      if (request.current) request.current.valid = false;
      void stop();
    };
  }, [record.id, record.revision, stop]);
  const send = (text: string, intent: 'chat' | 'review' = 'chat') => {
    if (chat.status === 'submitted' || chat.status === 'streaming') return;
    setClosed(current => ({
      ...Object.fromEntries(proposals.map(item => [item.proposal.id, 'Superseded' as const])),
      ...current,
    }));
    request.current = { revision: record.revision, valid: true };
    setBases(current => ({ ...current, [record.revision]: structuredClone(record) }));
    setStopped(false);
    lastRequest.current = { text, intent };
    void chat.sendMessage({ text }, { body: { snapshot: record, selected, intent } });
  };
  const retry = () => {
    if (lastRequest.current) send(lastRequest.current.text, lastRequest.current.intent);
  };
  const proposals = chat.messages.flatMap(message =>
    message.parts.flatMap(part => {
      if (!isToolUIPart(part) || part.state !== 'output-available') return [];
      const parsed = proposalResult.safeParse(part.output);
      return parsed.success
        ? [{ proposal: parsed.data.proposal, messageId: message.id, toolCallId: part.toolCallId }]
        : [];
    }),
  );
  const reviews = chat.messages.flatMap(message =>
    message.parts.flatMap(part => {
      if (part.type !== 'data-review' || !('data' in part)) return [];
      const parsed = behaviorReviewSchema.safeParse(part.data);
      return parsed.success && completed.includes(message.id) ? [parsed.data] : [];
    }),
  );
  const busy = chat.status === 'submitted' || chat.status === 'streaming';
  const latest = proposals.at(-1);
  const lastPatch = chat.messages
    .flatMap(message =>
      message.parts.filter(
        part =>
          isToolUIPart(part) &&
          (part.type === 'tool-propose_agent_patch' ||
            (part.type === 'dynamic-tool' && part.toolName === 'propose_agent_patch')),
      ),
    )
    .at(-1);
  const lastPatchId = lastPatch && isToolUIPart(lastPatch) ? lastPatch.toolCallId : null;
  const state = (item: (typeof proposals)[number]) =>
    closed[item.proposal.id] ??
    (item.proposal.agentId !== record.id || item.proposal.baseRevision !== record.revision
      ? 'Out of date'
      : item !== latest || item.toolCallId !== lastPatchId
        ? 'Superseded'
        : !completed.includes(item.messageId)
          ? busy
            ? 'Validating proposal…'
            : 'Interrupted'
          : busy
            ? 'Superseded'
            : 'Ready to apply');
  return {
    ...chat,
    busy,
    stopped,
    send,
    retry,
    proposals,
    reviews,
    review: reviews.at(-1),
    bases,
    state,
    close: (id: string, value: 'Dismissed' | 'Applied') =>
      setClosed(current => ({ ...current, [id]: value })),
    stopGeneration: () => {
      if (request.current) request.current.valid = false;
      setStopped(true);
      void stop();
    },
  };
}
export type Copilot = ReturnType<typeof useCopilot>;
