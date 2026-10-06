import { expect, test } from 'vitest';
import {
  editCollectedField,
  fieldKey,
  fieldKind,
  removeCollectedField,
  type FieldDraft,
} from './collected-fields';
import { edgeSchema } from './schema';

const slot: FieldDraft = {
  originalKey: null,
  key: 'slot',
  description: 'The chosen appointment slot.',
  kind: 'choice',
  options: ['Tuesday 10 AM', 'Thursday 2 PM'],
  required: true,
  error: '',
};
const edge = edgeSchema.parse({ function: 'collect', target: 'end', description: 'Done' });
test('Slot produces exactly the native properties and required representation', () => {
  expect(editCollectedField(edge, slot)).toEqual({
    properties: {
      slot: {
        type: 'string',
        description: 'The chosen appointment slot.',
        enum: ['Tuesday 10 AM', 'Thursday 2 PM'],
      },
    },
    required: ['slot'],
  });
  expect(fieldKey('Insurance provider')).toBe('insurance_provider');
});
test('rename, option edits, required toggles and deletion preserve native schemas immutably', () => {
  const native = {
    type: 'string',
    description: 'Name',
    enum: ['A', 'B'],
    minLength: 1,
    native: { values: [null, true] },
  };
  const current = {
    ...edge,
    properties: { slot: native, complex: { type: 'object', properties: { nested: { type: 'string' } } } },
    required: ['slot'],
  };
  const before = structuredClone(current);
  const changed = editCollectedField(current, {
    ...slot,
    originalKey: 'slot',
    key: 'appointment',
    options: ['A', 'C'],
  });
  expect(changed.required).toEqual(['appointment']);
  expect(changed.properties.appointment).toEqual({
    ...native,
    description: slot.description,
    enum: ['A', 'C'],
  });
  expect(changed.properties.complex).toEqual(current.properties.complex);
  expect(
    editCollectedField(
      { ...edge, ...changed },
      { ...slot, originalKey: 'appointment', key: 'appointment', required: false },
    ).required,
  ).toEqual([]);
  expect(removeCollectedField({ ...edge, ...changed }, 'appointment')).toEqual({
    properties: { complex: current.properties.complex },
    required: [],
  });
  expect(current).toEqual(before);
});
test('invalid keys and options reject atomically; changing choice requires explicit option removal', () => {
  const current = { ...edge, ...editCollectedField(edge, slot) };
  for (const changes of [
    { key: '' },
    { key: 'slot' },
    { key: 'new', options: [''] },
    { key: 'new', options: ['A', ' A '] },
    { key: 'new', kind: 'number' as const },
  ]) {
    expect(() => editCollectedField(current, { ...slot, ...changes })).toThrow();
  }
  expect(
    editCollectedField(current, { ...slot, originalKey: 'slot', kind: 'number', options: [] }).properties
      .slot,
  ).toEqual({ type: 'number', description: slot.description });
});
test('classifies enums and complex schemas accurately', () => {
  expect(fieldKind({ type: 'string', enum: ['A'] })).toBe('choice');
  expect(fieldKind({ type: 'string' })).toBe('string');
  expect(fieldKind({ type: 'number', enum: [1, 2] })).toBeNull();
  expect(fieldKind({ type: 'string', oneOf: [] })).toBeNull();
  expect(fieldKind({ type: 'object' })).toBeNull();
});
