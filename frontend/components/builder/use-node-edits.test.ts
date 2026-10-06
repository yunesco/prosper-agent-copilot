// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { useNodeEdits } from './use-node-edits';

test('moving the source carries unfinished fields and invalid JSON to the new transition address', () => {
  const agent = loadAgentFixture('original-scheduler');
  const { result } = renderHook(() => useNodeEdits(agent, 'offer_times', vi.fn()));
  const draft = { originalKey: 'slot', key: 'appointment_slot', description: 'Slot', kind: 'choice' as const, options: ['Monday'], required: true, error: '' };
  act(() => result.current.fieldEdit('offer_times', 'select_time', draft));
  act(() => result.current.reconnect('offer_times', 'select_time', 'collect_details', 'confirm'));
  expect(result.current.fieldEdits['collect_details\0select_time']).toEqual(draft);
  expect(result.current.fieldEdits['offer_times\0select_time']).toBeUndefined();
  expect(result.current.unfinishedField).toBe(true);
  act(() => result.current.finishField('collect_details', 'select_time'));
  expect(result.current.agent.nodes[1].edges[1].properties.appointment_slot).toEqual({ type: 'string', description: 'Slot', enum: ['Monday'] });
  act(() => result.current.collection('collect_details', 'select_time', '{unfinished'));
  act(() => result.current.reconnect('collect_details', 'select_time', 'offer_times', 'confirm'));
  expect(result.current.collections['offer_times\0select_time'].text).toBe('{unfinished');
  expect(result.current.collections['collect_details\0select_time']).toBeUndefined();
  expect(result.current.invalidCollection).toBe(true);
  act(() => result.current.cancel());
  expect(result.current.agent).toBe(agent);
  expect(result.current.dirty).toBe(false);
});
