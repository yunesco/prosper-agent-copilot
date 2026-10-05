import { afterEach, beforeEach, vi } from 'vitest';

// Unit/integration tests must inject a fake fetch at API boundaries.
beforeEach(() => {
  vi.stubGlobal('fetch', () => { throw new Error('Network disabled in deterministic tests'); });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
