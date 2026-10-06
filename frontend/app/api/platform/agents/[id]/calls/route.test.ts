import { expect, test } from 'vitest';
import { GET as list } from './route';
import { GET as detail } from './[callId]/route';

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const req = (path: string) => new Request(`http://localhost/api/platform/agents/${path}`);

test('GET calls returns a page, honours filters, and rejects bad queries', async () => {
  const ok = await list(req('clinic-scheduler/calls?outcome=failed'), ctx({ id: 'clinic-scheduler' }));
  expect(ok.status).toBe(200);
  expect((await ok.json()).calls.map((call: { id: string }) => call.id)).toEqual(['new-patient-friday']);
  for (const query of ['outcome=maybe', 'limit=0', 'limit=abc', 'cursor=%25%25']) {
    expect(
      (await list(req(`clinic-scheduler/calls?${query}`), ctx({ id: 'clinic-scheduler' }))).status,
      query,
    ).toBe(400);
  }
});

test('GET call detail returns the transcript to its owner only', async () => {
  const ok = await detail(
    req('clinic-scheduler/calls/new-patient-friday'),
    ctx({ id: 'clinic-scheduler', callId: 'new-patient-friday' }),
  );
  expect((await ok.json()).transcript).toHaveLength(5);
  const other = await detail(
    req('generated-agent/calls/new-patient-friday'),
    ctx({ id: 'generated-agent', callId: 'new-patient-friday' }),
  );
  expect(other.status).toBe(404);
});
