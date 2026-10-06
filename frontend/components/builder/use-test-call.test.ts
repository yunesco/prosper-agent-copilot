// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { createVoiceCall } from '@/lib/runtime/voice';
import { loadAgentFixture } from '@/lib/fixtures';
import { useTestCall } from './use-test-call';
vi.mock('@/lib/runtime/voice', () => ({ createVoiceCall: vi.fn() }));

test('pins an immutable saved snapshot and rejects callbacks after stop, restart and unmount', () => {
  const calls: {
    callbacks: Parameters<typeof createVoiceCall>[1];
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.mocked(createVoiceCall).mockImplementation((_audio, callbacks) => {
    const call = { callbacks, start: vi.fn(async () => {}), stop: vi.fn() };
    calls.push(call);
    return call;
  });
  const record = { id: 'saved', revision: 3, guidelines: '', agent: loadAgentFixture('original-scheduler') };
  const audio = { current: document.createElement('audio') };
  const { result, unmount } = renderHook(() => useTestCall(record, audio));
  act(() => result.current.start());
  expect(result.current.identity).toEqual({ id: 'saved', revision: 3 });
  expect(calls[0].start.mock.calls[0][0]).toEqual(record.agent);
  expect(calls[0].start.mock.calls[0][0]).not.toBe(record.agent);
  act(() => {
    result.current.stop();
    result.current.start();
  });
  act(() => {
    calls[0].callbacks.connected();
    calls[0].callbacks.failed('late');
    calls[0].callbacks.transcript({ role: 'user', text: 'late' });
  });
  expect(result.current.status).toBe('connecting');
  expect(result.current.error).toBe('');
  expect(result.current.transcript).toEqual([]);
  expect(calls[0].stop).toHaveBeenCalledOnce();
  unmount();
  expect(calls[1].stop).toHaveBeenCalledOnce();
});
