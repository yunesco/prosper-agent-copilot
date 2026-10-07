import { afterEach, expect, test, vi } from 'vitest';

const body = (extra: object = {}) =>
  JSON.stringify({
    snapshot: {
      id: 'a',
      revision: 1,
      guidelines: 'Never invent availability.',
      agent: {
        name: 'A',
        initial_node: 's',
        nodes: [{ name: 's', end: true, task_messages: [{ role: 'developer', content: 'Bye.' }] }],
      },
    },
    intent: 'review',
    messages: [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'Review' }] }],
    ...extra,
  });
const post = (payload: string) =>
  new Request('http://test/api/copilot', {
    method: 'POST',
    body: payload,
    signal: new AbortController().signal,
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

test('rejects malformed requests before any model call', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  const { POST } = await import('./route');
  expect((await POST(post('{not json'))).status).toBe(400);
  expect((await POST(post(JSON.stringify({ intent: 'chat' })))).status).toBe(400);
});

test('reports a missing model key as a configuration error, not a model failure', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  const { POST } = await import('./route');
  const response = await POST(post(body()));
  expect(response.status).toBe(503);
  expect(await response.text()).toContain('OPENAI_API_KEY');
});

test('a failing model returns the safe message to the client and logs the cause, never the secrets', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'sk-secret-test-key');
  vi.doMock('@/lib/copilot/server', async importOriginal => ({
    ...(await importOriginal<typeof import('@/lib/copilot/server')>()),
    reviewBehavior: async () => {
      throw new Error('Invalid schema for response_format');
    },
  }));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { POST } = await import('./route');
  const text = await (await POST(post(body()))).text();
  expect(text).toContain('Copilot could not complete this request');
  expect(text).not.toContain('Invalid schema');
  expect(text).not.toContain('sk-secret-test-key');
  const logged = log.mock.calls.flat().join(' ');
  expect(logged).toContain('Invalid schema for response_format');
  expect(logged).not.toContain('sk-secret-test-key');
  expect(logged).not.toContain('Never invent availability');
});
