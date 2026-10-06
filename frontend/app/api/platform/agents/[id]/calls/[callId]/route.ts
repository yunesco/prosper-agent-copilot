import { getCall, PlatformError } from '@/lib/platform/store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; callId: string }> },
) {
  const { id, callId } = await params;
  try {
    return Response.json(getCall(id, callId));
  } catch (error) {
    if (error instanceof PlatformError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
