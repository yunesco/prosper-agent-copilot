import { expect, test, vi } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { validateAgent } from './validation';

test('sends the whole candidate for validation', async () => {
  const agent = loadAgentFixture('original-scheduler');
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ valid: true }));
  await validateAgent(agent, { fetcher });
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(agent);
});
test.each([
  () => Promise.reject(new Error('offline')),
  () => Promise.resolve(Response.json({ valid: false, error: 'Invalid graph' }, { status: 422 })),
  () => Promise.resolve(Response.json({ unexpected: true })),
  () => Promise.resolve(Response.json({ valid: true }, { status: 500 })),
])('fails closed on transport, validation and protocol failures', async fetcher => {
  await expect(validateAgent(loadAgentFixture('original-scheduler'), { fetcher })).rejects.toThrow();
});

test('preserves every Python validation error for proposal repair', async () => {
  const errors = ['Duplicate function', 'Unknown target'];
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ valid: false, error: errors.join('\n'), errors }, { status: 422 }));
  await expect(validateAgent(loadAgentFixture('original-scheduler'), { fetcher })).rejects.toMatchObject({ errors, message: errors.join('\n') });
});
