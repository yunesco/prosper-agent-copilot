import { listCalls, PlatformError } from '@/lib/platform/store';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const outcome = query.get('outcome');
  const limit = query.get('limit');
  try {
    if (outcome !== null && outcome !== 'successful' && outcome !== 'failed')
      throw new PlatformError(400, 'outcome must be successful or failed.');
    return Response.json(
      listCalls(id, {
        outcome: outcome ?? undefined,
        limit: limit === null ? undefined : Number(limit),
        cursor: query.get('cursor'),
      }),
    );
  } catch (error) {
    if (error instanceof PlatformError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
