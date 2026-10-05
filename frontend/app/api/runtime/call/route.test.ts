import { expect, test, vi } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { POST } from './route';
const request = (body: string) => new Request('http://localhost/api/runtime/call', { method: 'POST', body });

test('rejects invalid JSON and payloads without contacting voice', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  for (const body of ['{', '{}', 'null']) expect((await POST(request(body))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
test('forwards parsed agent only to the configured server endpoint', async () => {
  const answer = { sdp: 'answer', type: 'answer', pc_id: 'session' };
  const fetcher = vi.fn().mockResolvedValue(Response.json(answer)); vi.stubGlobal('fetch', fetcher);
  const offer = { agent: loadAgentFixture('original-scheduler'), sdp: 'offer', type: 'offer' };
  expect(await (await POST(request(JSON.stringify(offer)))).json()).toEqual(answer);
  expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:7860/test/offer');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(offer);
});
test('reports unavailable runtime', async () => {
  const response = await POST(request(JSON.stringify({ agent: loadAgentFixture('original-scheduler'), sdp: 'offer', type: 'offer' })));
  expect(response.status).toBe(502);
  expect((await response.json()).error).toContain('unavailable');
});
