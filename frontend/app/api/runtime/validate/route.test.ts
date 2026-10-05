import { expect, test, vi } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { POST } from './route';

test('rejects malformed JSON before reaching Python', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const response = await POST(new Request('http://localhost/api/runtime/validate', { method: 'POST', body: '{' }));
  expect(response.status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([true, false])('passes Python acceptance or rejection through: %s', async valid => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(valid ? { valid } : { valid, error: 'Invalid candidate' }, { status: valid ? 200 : 422 }));
  vi.stubGlobal('fetch', fetcher);
  const agent = loadAgentFixture('original-scheduler');
  const response = await POST(new Request('http://localhost/api/runtime/validate', { method: 'POST', body: JSON.stringify(agent) }));
  expect((await response.json()).valid).toBe(valid);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(agent);
});
