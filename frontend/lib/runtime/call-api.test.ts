import { expect, test, vi } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { requestCallAnswer } from './call-api';

const offer = { agent: loadAgentFixture('original-scheduler'), sdp: 'offer', type: 'offer' as const };
test('sends the complete saved graph and returns a parsed answer', async () => {
  const answer = { sdp: 'answer', type: 'answer', pc_id: 'session' };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(answer));
  expect(await requestCallAnswer(offer, { fetcher })).toEqual(answer);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(offer);
});
test.each([
  () => Promise.reject(new Error('offline')),
  () => Promise.resolve(Response.json({ error: 'Invalid graph' }, { status: 422 })),
  () => Promise.resolve(Response.json({ sdp: 'answer', type: 'answer', pc_id: 'session' }, { status: 500 })),
  () => Promise.resolve(Response.json({ type: 'offer' })),
  () => Promise.resolve(new Response('not JSON')),
])('rejects HTTP, transport and protocol failures', async fetcher => {
  await expect(requestCallAnswer(offer, { fetcher })).rejects.toThrow();
});
