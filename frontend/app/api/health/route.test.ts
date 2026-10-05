import { expect, test } from 'vitest';
import { GET } from './route';

test('reports frontend liveness without requiring Python or model keys', async () => {
  const response = GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', service: 'frontend' });
});
