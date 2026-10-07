import { expect, test } from 'vitest';
import type { UIMessage } from 'ai';
import { copilotPhase } from './copilot-activity';

const assistant = (...parts: unknown[]) => [{ id: 'a', role: 'assistant', parts }] as unknown as UIMessage[];
const tool = (name: string, state: string, extra: object = {}) => ({
  type: `tool-${name}`,
  toolCallId: name + state + Math.random(),
  state,
  input: {},
  ...extra,
});
const addNode = (name: string) => ({ type: 'add_node', value: { name } });

test.each([
  ['no answer yet', [], 'Thinking…'],
  ['only a step marker so far', assistant({ type: 'step-start' }), 'Thinking…'],
  ['reading the agent', assistant(tool('get_agent', 'input-available')), 'Reading your agent…'],
  ['reading a call', assistant(tool('get_call', 'input-available')), 'Reading call transcripts…'],
  [
    'the model is thinking after it read the agent',
    assistant(tool('get_agent', 'output-available', { output: {} })),
    'Thinking…',
  ],
  [
    'the validator is running',
    assistant(tool('get_agent', 'output-available'), tool('propose_agent_patch', 'input-available')),
    'Checking with the validator…',
  ],
  [
    'a valid proposal came back',
    assistant(tool('propose_agent_patch', 'output-available', { output: { valid: true } })),
    'Writing the summary…',
  ],
  [
    'a rejected proposal came back',
    assistant(tool('propose_agent_patch', 'output-available', { output: { valid: false, error: 'x' } })),
    'Fixing the proposal…',
  ],
  [
    'the summary is streaming',
    assistant(tool('get_agent', 'output-available'), { type: 'text', text: 'Done' }),
    'Writing the summary…',
  ],
])('chat phase: %s', (_, messages, label) => {
  expect(copilotPhase(messages as UIMessage[])).toBe(label);
});

test('counts only finished steps while the graph streams, ignoring a partial last entry', () => {
  const streaming = (operations: unknown) =>
    assistant(
      tool('propose_agent_patch', 'input-streaming', {
        input: operations === undefined ? {} : { operations },
      }),
    );
  expect(copilotPhase(streaming(undefined))).toBe('Writing the graph…');
  expect(copilotPhase(streaming([addNode('a')]))).toBe('Writing the graph…');
  expect(copilotPhase(streaming([addNode('a'), addNode('b'), { type: 'add_n' }]))).toBe(
    'Writing the graph… 2 steps',
  );
  expect(copilotPhase(streaming([{ type: 'update_node' }, addNode('a'), addNode('b')]))).toBe(
    'Writing the graph… 1 step',
  );
  expect(copilotPhase(streaming('not an array'))).toBe('Writing the graph…');
});

test('a second proposal is named as a retry', () => {
  const messages = assistant(
    tool('propose_agent_patch', 'output-available', { output: { valid: false, error: 'x' } }),
    tool('propose_agent_patch', 'input-streaming', { input: { operations: [addNode('a'), addNode('b')] } }),
  );
  expect(copilotPhase(messages)).toBe('Rewriting the graph (attempt 2)… 1 step');
  expect(
    copilotPhase(
      assistant(
        tool('propose_agent_patch', 'output-available', { output: { valid: false } }),
        tool('propose_agent_patch', 'input-available'),
      ),
    ),
  ).toBe('Checking with the validator (attempt 2)…');
});

test('a review has no stream to read, so it is named by what it does', () => {
  expect(copilotPhase([], 'review')).toBe('Comparing the guidelines with your agent…');
});
