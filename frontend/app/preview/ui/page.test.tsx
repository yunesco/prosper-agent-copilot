import { afterEach, expect, test, vi } from 'vitest';
import PreviewPage from './page';

afterEach(() => vi.unstubAllEnvs());

test('normal builds reject the synthetic preview route', () => {
  vi.stubEnv('UI_PREVIEW', undefined);
  expect(() => PreviewPage()).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
});

test('preview requires an explicit opt-in', () => {
  vi.stubEnv('UI_PREVIEW', '1');
  expect(PreviewPage()).toBeDefined();
});
