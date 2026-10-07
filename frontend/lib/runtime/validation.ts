import { z } from 'zod';
import type { AgentConfig } from '@/lib/agent/schema';

const validationResult = z.discriminatedUnion('valid', [
  z.object({ valid: z.literal(true) }),
  z.object({ valid: z.literal(false), error: z.string(), errors: z.array(z.string()).optional() }),
]);
export class AgentValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join('\n'));
  }
}

/** The validator could not give a verdict (down, unreadable, failing). Rewriting the proposal cannot help. */
export class ValidationUnavailableError extends Error {}

export async function validateAgent(
  agent: AgentConfig,
  options: { url?: string; fetcher?: typeof fetch } = {},
): Promise<void> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(options.url ?? '/api/runtime/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agent),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ValidationUnavailableError('Validation service unavailable. Your changes were not saved.');
  }
  const result = validationResult.safeParse(await response.json().catch(() => null));
  if (!result.success)
    throw new ValidationUnavailableError('Invalid validation response. Your changes were not saved.');
  if (!result.data.valid) throw new AgentValidationError(result.data.errors ?? [result.data.error]);
  if (!response.ok)
    throw new ValidationUnavailableError('Validation service failed. Your changes were not saved.');
}
