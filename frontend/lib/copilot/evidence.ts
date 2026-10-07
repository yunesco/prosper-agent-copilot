import { isToolUIPart, type UIMessage } from 'ai';
import { z } from 'zod';
import type { GraphReference } from '../agent/proposals';

export type Evidence =
  { kind: 'call'; callId: string; turn: number } | { kind: 'graph'; reference: GraphReference };

/** Parses the in-app link schemes Copilot is told to use: `call:ID#TURN`, `graph:NODE`, `graph:NODE/FUNCTION`.
 * Hrefs are model-authored: malformed percent-escapes are not references, and must not throw during render. */
export function parseEvidenceHref(href: string): Evidence | null {
  try {
    const call = /^call:([^#]+)#(\d+)$/.exec(href);
    if (call) return { kind: 'call', callId: decodeURIComponent(call[1]), turn: Number(call[2]) };
    const graph = /^graph:([^/]+)(?:\/(.+))?$/.exec(href);
    if (!graph) return null;
    const node = decodeURIComponent(graph[1]);
    return {
      kind: 'graph',
      reference: graph[2]
        ? { kind: 'transition', node, function: decodeURIComponent(graph[2]) }
        : { kind: 'node', node },
    };
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}

const readCall = z.object({ id: z.string(), transcript: z.array(z.object({ turn: z.number().int() })) });

/**
 * Calls whose transcript Copilot actually read in this conversation, with their turn counts.
 * A call citation is trustworthy only if the same conversation holds that tool result.
 */
export function readCallTurns(messages: Pick<UIMessage, 'parts'>[]): Map<string, number> {
  const turns = new Map<string, number>();
  for (const message of messages)
    for (const part of message.parts) {
      if (!isToolUIPart(part) || part.state !== 'output-available') continue;
      const name = part.type === 'dynamic-tool' ? part.toolName : part.type.slice(5);
      const parsed = name === 'get_call' ? readCall.safeParse(part.output) : null;
      if (parsed?.success) turns.set(parsed.data.id, parsed.data.transcript.length);
    }
  return turns;
}

export const citationVerified = (read: Map<string, number>, callId: string, turn: number) =>
  turn >= 1 && turn <= (read.get(callId) ?? 0);
