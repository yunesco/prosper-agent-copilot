import { callPageSchema, callSchema, type CallSummary, type ProductionCall } from '../platform/schema';

async function get<T>(
  path: string,
  parse: (data: unknown) => T,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetcher(path, { signal });
  if (!response.ok)
    throw new Error(response.status === 404 ? 'Call not found for this agent.' : 'Could not load call data.');
  return parse(await response.json());
}

const base = (agentId: string) => `/api/platform/agents/${encodeURIComponent(agentId)}/calls`;

export async function fetchCalls(
  agentId: string,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<CallSummary[]> {
  return (
    await get(base(agentId), data => callPageSchema.parse(data), options.fetcher ?? fetch, options.signal)
  ).calls;
}

export function fetchCall(
  agentId: string,
  callId: string,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<ProductionCall> {
  return get(
    `${base(agentId)}/${encodeURIComponent(callId)}`,
    data => callSchema.parse(data),
    options.fetcher ?? fetch,
    options.signal,
  );
}
