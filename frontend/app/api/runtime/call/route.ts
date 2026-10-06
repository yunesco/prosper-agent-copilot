import { callOfferSchema, requestCallAnswer } from '@/lib/runtime/call-api';

export async function POST(request: Request) {
  const parsed = callOfferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid call payload.' }, { status: 400 });
  try {
    return Response.json(
      await requestCallAnswer(parsed.data, {
        url: `${process.env.VOICE_RUNTIME_URL ?? 'http://127.0.0.1:7860'}/test/offer`,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
      }),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Voice runtime unavailable.' },
      { status: 502 },
    );
  }
}
