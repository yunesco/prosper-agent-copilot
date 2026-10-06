import { expect, test } from 'vitest';
import { citationVerified, parseEvidenceHref, readCallTurns } from './evidence';

test('parses call and graph references and rejects anything else', () => {
  expect(parseEvidenceHref('call:new-patient-friday#3')).toEqual({
    kind: 'call',
    callId: 'new-patient-friday',
    turn: 3,
  });
  expect(parseEvidenceHref('graph:offer_times')).toEqual({
    kind: 'graph',
    reference: { kind: 'node', node: 'offer_times' },
  });
  expect(parseEvidenceHref('graph:offer_times/select_time')).toEqual({
    kind: 'graph',
    reference: { kind: 'transition', node: 'offer_times', function: 'select_time' },
  });
  for (const href of ['call:x', 'call:x#a', 'graph:', 'https://example.com', 'javascript:alert(1)'])
    expect(parseEvidenceHref(href), href).toBeNull();
});

const toolPart = (name: string, output: unknown, state = 'output-available') => ({
  type: `tool-${name}`,
  toolCallId: name + Math.random(),
  state,
  input: {},
  output,
});

test('only calls read through get_call in this conversation can be cited, within their real turns', () => {
  const messages = [
    {
      parts: [
        toolPart('get_call', {
          id: 'new-patient-friday',
          transcript: [{ turn: 1 }, { turn: 2 }, { turn: 3 }],
        }),
        toolPart('get_call', { error: 'Call not found for this agent.' }),
        toolPart('get_calls', { calls: [{ id: 'listed-only' }] }),
        toolPart('get_call', { id: 'still-running', transcript: [{ turn: 1 }] }, 'input-available'),
        { type: 'text', text: 'prose that merely mentions turn 9' },
      ],
    },
  ] as Parameters<typeof readCallTurns>[0];
  const read = readCallTurns(messages);
  expect([...read]).toEqual([['new-patient-friday', 3]]);
  expect(citationVerified(read, 'new-patient-friday', 3)).toBe(true);
  expect(citationVerified(read, 'new-patient-friday', 4)).toBe(false);
  expect(citationVerified(read, 'new-patient-friday', 0)).toBe(false);
  expect(citationVerified(read, 'listed-only', 1)).toBe(false);
  expect(citationVerified(read, 'invented', 1)).toBe(false);
});
