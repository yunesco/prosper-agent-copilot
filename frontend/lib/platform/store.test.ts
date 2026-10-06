import { expect, test } from 'vitest';
import { getCall, listCalls, PlatformError } from './store';
import { callPageSchema } from './schema';

test('lists only the requested agent’s calls as summaries without transcripts', () => {
  const page = callPageSchema.parse(listCalls('clinic-scheduler'));
  expect(page.calls.length).toBeGreaterThanOrEqual(5);
  expect(page.calls.every(call => call.agent_id === 'clinic-scheduler')).toBe(true);
  expect(JSON.stringify(page)).not.toContain('transcript');
  expect(page.calls.find(call => call.id === 'new-patient-friday')).toMatchObject({
    outcome: 'failed',
    reported: true,
    turns: 5,
  });
  expect(listCalls('generated-agent').calls).toEqual([]);
});

test('filters by outcome and paginates with opaque cursors', () => {
  const failed = listCalls('clinic-scheduler', { outcome: 'failed' });
  expect(failed.calls.map(call => call.id)).toEqual(['new-patient-friday']);
  const first = listCalls('clinic-scheduler', { limit: 2 });
  expect(first.calls).toHaveLength(2);
  expect(first.next_cursor).toBeTruthy();
  const second = listCalls('clinic-scheduler', { limit: 2, cursor: first.next_cursor });
  expect(second.calls.map(call => call.id)).not.toContain(first.calls[0].id);
  const all = listCalls('clinic-scheduler', { limit: 50 });
  expect(all.next_cursor).toBeNull();
  expect([
    ...first.calls,
    ...second.calls,
    ...listCalls('clinic-scheduler', { limit: 50, cursor: second.next_cursor }).calls,
  ]).toEqual(all.calls);
});

test('rejects invalid queries', () => {
  for (const query of [
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { cursor: btoa('-1') },
    { cursor: btoa('x') },
  ]) {
    expect(() => listCalls('clinic-scheduler', query), JSON.stringify(query)).toThrow(PlatformError);
  }
});

test('call detail is owner-scoped: unknown and cross-agent IDs are indistinguishable', () => {
  expect(getCall('clinic-scheduler', 'new-patient-friday').transcript).toHaveLength(5);
  for (const [agent, id] of [
    ['generated-agent', 'new-patient-friday'],
    ['clinic-scheduler', 'nope'],
  ]) {
    expect(() => getCall(agent, id)).toThrowError(
      expect.objectContaining({ status: 404, message: 'Call not found for this agent.' }),
    );
  }
});
