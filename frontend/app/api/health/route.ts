// Frontend liveness only; this does not claim the voice runtime is connected.
export function GET() {
  return Response.json({ status: 'ok', service: 'frontend' });
}
