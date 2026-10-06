// Mock of the Prosper platform's production-call API. Data is seeded from the
// synthetic fixtures; a real deployment would replace this module (and the
// handlers under app/api/platform) with calls to the platform. No persistence.
import { callsForAgent } from '../fixtures';
import type { CallPage, CallSummary, ProductionCall } from './schema';

export type CallQuery = { outcome?: ProductionCall['outcome']; limit?: number; cursor?: string | null };
const MAX_LIMIT = 50;

export class PlatformError extends Error {
  constructor(
    readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

const summarize = (call: ProductionCall): CallSummary => ({
  id: call.id,
  agent_id: call.agent_id,
  title: call.title,
  outcome: call.outcome,
  duration_seconds: call.duration_seconds,
  graph_path: call.graph_path,
  turns: call.transcript.length,
  reported: !!call.client_feedback,
});

const decodeCursor = (cursor: string) => {
  try {
    return Number(atob(cursor));
  } catch {
    return NaN;
  }
};

/** Newest-first listing (fixture order is the platform's order). Cursors are opaque offsets. */
export function listCalls(agentId: string, query: CallQuery = {}): CallPage {
  const limit = query.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new PlatformError(400, `limit must be between 1 and ${MAX_LIMIT}.`);
  const offset = query.cursor ? decodeCursor(query.cursor) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new PlatformError(400, 'Invalid cursor.');
  const matching = callsForAgent(agentId).filter(call => !query.outcome || call.outcome === query.outcome);
  const page = matching.slice(offset, offset + limit);
  return {
    calls: page.map(summarize),
    next_cursor: offset + limit < matching.length ? btoa(String(offset + limit)) : null,
  };
}

/** Ownership is part of the lookup: another agent's call is indistinguishable from a missing one. */
export function getCall(agentId: string, callId: string): ProductionCall {
  const call = callsForAgent(agentId).find(item => item.id === callId);
  if (!call) throw new PlatformError(404, 'Call not found for this agent.');
  return call;
}
