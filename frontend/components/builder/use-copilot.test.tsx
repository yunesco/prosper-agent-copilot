// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import type { SavedAgent } from '@/lib/agent/repository';
import { useCopilot } from './use-copilot';

const sdk = vi.hoisted(() => ({ sendMessage: vi.fn(), stop: vi.fn(), status: 'ready', messages: [] }));
vi.mock('@ai-sdk/react', () => ({ useChat: () => sdk }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sdk.status = 'ready';
});
const record: SavedAgent = {
  id: 'test-agent',
  revision: 1,
  agent: loadAgentFixture('clinic-scheduler'),
  guidelines: 'Collect name.',
};

test('retry repeats the original review text and intent using the current saved snapshot', () => {
  const { result, rerender } = renderHook(({ snapshot }) => useCopilot(snapshot, null), {
    initialProps: { snapshot: record },
  });
  act(() => result.current.send('Review these guidelines exactly.', 'review'));
  const saved = { ...record, revision: 2, guidelines: 'Collect name and DOB.' };
  rerender({ snapshot: saved });
  act(() => result.current.retry());
  expect(sdk.sendMessage).toHaveBeenLastCalledWith(
    { text: 'Review these guidelines exactly.' },
    { body: { snapshot: saved, selected: null, intent: 'review' } },
  );
});

test('retry does nothing before a request or while generation is busy', () => {
  const { result, rerender } = renderHook(() => useCopilot(record, null));
  act(() => result.current.retry());
  expect(sdk.sendMessage).not.toHaveBeenCalled();
  act(() => result.current.send('Improve the greeting.'));
  sdk.status = 'streaming';
  rerender();
  act(() => result.current.retry());
  expect(sdk.sendMessage).toHaveBeenCalledTimes(1);
});

test('switching agent identity clears the retry request', () => {
  const { result, rerender } = renderHook(({ snapshot }) => useCopilot(snapshot, null), {
    initialProps: { snapshot: record },
  });
  act(() => result.current.send('Review this agent.', 'review'));
  rerender({ snapshot: { ...record, id: 'another-agent' } });
  act(() => result.current.retry());
  expect(sdk.sendMessage).toHaveBeenCalledTimes(1);
});
