// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { loadAgentFixture } from '@/lib/fixtures';
import { useNodeEdits } from './use-node-edits';

test('moving the source carries unfinished fields and invalid JSON to the new transition address', () => {
  const agent = loadAgentFixture('original-scheduler');
  const { result } = renderHook(() => useNodeEdits(agent, 'offer_times', vi.fn()));
  const draft = {
    originalKey: 'slot',
    key: 'appointment_slot',
    description: 'Slot',
    kind: 'choice' as const,
    options: ['Monday'],
    required: true,
    error: '',
  };
  act(() => result.current.fieldEdit('offer_times', 'select_time', draft));
  act(() => result.current.reconnect('offer_times', 'select_time', 'collect_details', 'confirm'));
  expect(result.current.fieldEdits['collect_details\0select_time']).toEqual(draft);
  expect(result.current.fieldEdits['offer_times\0select_time']).toBeUndefined();
  expect(result.current.unfinishedField).toBe(true);
  act(() => result.current.finishField('collect_details', 'select_time'));
  expect(result.current.agent.nodes[1].edges[1].properties.appointment_slot).toEqual({
    type: 'string',
    description: 'Slot',
    enum: ['Monday'],
  });
  act(() => result.current.collection('collect_details', 'select_time', '{unfinished'));
  act(() => result.current.reconnect('collect_details', 'select_time', 'offer_times', 'confirm'));
  expect(result.current.collections['offer_times\0select_time'].text).toBe('{unfinished');
  expect(result.current.collections['collect_details\0select_time']).toBeUndefined();
  expect(result.current.invalidCollection).toBe(true);
  act(() => result.current.cancel());
  expect(result.current.agent).toBe(agent);
  expect(result.current.dirty).toBe(false);
});

test('graph and guidelines save together; failed validation retains drafts and Cancel restores both', async () => {
  const agent = loadAgentFixture('original-scheduler');
  const record = { id: 'saved', revision: 1, agent, guidelines: 'Saved guidelines' };
  const onSave = vi.fn().mockRejectedValueOnce(new Error('invalid')).mockResolvedValue(undefined);
  const { result } = renderHook(() => useNodeEdits(agent, null, onSave, record));
  act(() => {
    result.current.operate([{ type: 'update_agent', changes: { name: 'Draft' } }]);
    result.current.editGuidelines('Draft guidelines');
  });
  await act(async () => {
    expect(await result.current.save()).toBe(false);
  });
  expect(onSave).toHaveBeenCalledWith(
    [{ type: 'update_agent', changes: { name: 'Draft' } }],
    'Draft guidelines',
    expect.any(Function),
  );
  expect(result.current.guidelines).toBe('Draft guidelines');
  expect(result.current.error).toBe('invalid');
  act(() => result.current.cancel());
  expect(result.current.agent).toBe(agent);
  expect(result.current.guidelines).toBe('Saved guidelines');
  expect(result.current.dirty).toBe(false);
});

test('Cancel during validation invalidates the commit and its late result', async () => {
  const agent = loadAgentFixture('original-scheduler');
  let release = () => {};
  let commits = 0;
  const onSave = vi.fn(async (_ops, _guidelines, assertActive) => {
    await new Promise<void>(resolve => {
      release = resolve;
    });
    assertActive();
    commits++;
  });
  const { result } = renderHook(() => useNodeEdits(agent, null, onSave));
  act(() => result.current.editGuidelines('Draft'));
  let pending: Promise<boolean>;
  act(() => {
    pending = result.current.save();
  });
  act(() => result.current.cancel());
  await act(async () => {
    release();
    await pending;
  });
  expect(commits).toBe(0);
  expect(result.current.dirty).toBe(false);
  expect(result.current.saved).toBe(false);
  expect(result.current.error).toBe('');
});
