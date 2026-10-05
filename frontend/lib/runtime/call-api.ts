import { z } from 'zod';
import { agentSchema } from '@/lib/agent/schema';

export const callOfferSchema = z.object({ agent: agentSchema, sdp: z.string().min(1), type: z.literal('offer') }).strict();
export const callAnswerSchema = z.object({ sdp: z.string().min(1), type: z.literal('answer'), pc_id: z.string() });

export async function requestCallAnswer(offer: z.infer<typeof callOfferSchema>, options: { url?: string; fetcher?: typeof fetch; signal?: AbortSignal } = {}) {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(options.url ?? '/api/runtime/call', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(offer),
      signal: options.signal ?? AbortSignal.timeout(20_000),
    });
  } catch { throw new Error('Voice runtime unavailable. Check that the voice backend is running and try again.'); }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(data);
    throw new Error(error.success ? error.data.error : 'Voice runtime could not start the call.');
  }
  const answer = callAnswerSchema.safeParse(data);
  if (!answer.success) throw new Error('Invalid voice runtime response. Try again.');
  return answer.data;
}
