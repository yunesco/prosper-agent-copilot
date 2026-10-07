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

test('highlights the live step and pins each line to the step that generated it', () => {
  const calls: { callbacks: Parameters<typeof createVoiceCall>[1] }[] = [];
  vi.mocked(createVoiceCall).mockImplementation((_audio, callbacks) => {
    calls.push({ callbacks });
    return { start: vi.fn(async () => {}), stop: vi.fn() };
  });
  const agent = loadAgentFixture('original-scheduler');
  const record = { id: 'saved', revision: 1, guidelines: '', agent };
  const { result } = renderHook(() => useTestCall(record, { current: document.createElement('audio') }));
  act(() => result.current.start());
  const { callbacks } = calls[0];
  expect(result.current.activeNodeId).toBeNull();
  act(() => callbacks.connected());
  expect(result.current.activeNodeId).toBe(agent.initial_node);
  // Segment 1 is generated under the first step, but its spoken text arrives after the transition.
  act(() => {
    callbacks.transcript({ role: 'user', text: 'Hi' });
    callbacks.segmentStarted?.(1);
    callbacks.node?.('collect_details');
    callbacks.segmentStarted?.(2);
    callbacks.transcript({ role: 'assistant', text: 'Hello', segment: 1 });
    callbacks.transcript({ role: 'assistant', text: 'Your name?', segment: 2 });
    callbacks.transcript({ role: 'assistant', text: 'Hello there', segment: 1 });
  });
  expect(result.current.activeNodeId).toBe('collect_details');
  expect(result.current.transcript.map(line => [line.text, line.node])).toEqual([
    ['Hi', agent.initial_node],
    ['Hello there', agent.initial_node],
    ['Your name?', 'collect_details'],
  ]);
  act(() => result.current.stop());
  expect(result.current.activeNodeId).toBeNull();
});
