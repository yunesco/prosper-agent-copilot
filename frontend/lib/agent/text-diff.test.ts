import { expect, test } from 'vitest';
import { diffWords } from './text-diff';

const rebuild = (parts: ReturnType<typeof diffWords>, keep: 'removed' | 'added') =>
  parts
    .filter(part => part.kind !== keep)
    .map(part => part.text)
    .join('');

test('identical text is a single unchanged part', () => {
  expect(diffWords('Greet the caller.', 'Greet the caller.')).toEqual([
    { kind: 'same', text: 'Greet the caller.' },
  ]);
});

test('marks only the replaced words and rebuilds both sides exactly', () => {
  const before = 'Ask for the date of birth first.';
  const after = 'Ask for the full name first.';
  const parts = diffWords(before, after);
  expect(parts.filter(part => part.kind === 'removed').map(part => part.text)).toEqual(['date of birth ']);
  expect(parts.filter(part => part.kind === 'added').map(part => part.text)).toEqual(['full name ']);
  expect(rebuild(parts, 'added')).toBe(before);
  expect(rebuild(parts, 'removed')).toBe(after);
});

test('empty sides are all added or all removed', () => {
  expect(diffWords('', 'New step')).toEqual([{ kind: 'added', text: 'New step' }]);
  expect(diffWords('Old step', '')).toEqual([{ kind: 'removed', text: 'Old step' }]);
  expect(diffWords('', '')).toEqual([]);
});

test('preserves unicode, newlines and repeated words', () => {
  const before = 'Bonjour  🙂\nla la';
  const after = 'Bonjour  🙂\nla la la';
  const parts = diffWords(before, after);
  expect(rebuild(parts, 'added')).toBe(before);
  expect(rebuild(parts, 'removed')).toBe(after);
});
