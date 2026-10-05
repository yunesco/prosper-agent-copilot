import { agentSchema } from '@/lib/agent/schema';
import { validateAgent } from '@/lib/runtime/validation';

export async function POST(request: Request) {
  const parsed = agentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ valid: false, error: 'Invalid agent payload.' }, { status: 400 });
  try {
    await validateAgent(parsed.data, { url: `${process.env.AGENT_RUNTIME_URL ?? 'http://127.0.0.1:7861'}/validate` });
    return Response.json({ valid: true });
  } catch (error) {
    return Response.json({ valid: false, error: error instanceof Error ? error.message : 'Validation failed.' }, { status: 422 });
  }
}
