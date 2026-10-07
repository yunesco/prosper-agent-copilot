import type { UIMessage } from 'ai';
import { expect, it } from 'vitest';
import { copilotActivities } from './copilot-activity';

const tool = (type: string, output: unknown, input: unknown = {}) =>
  ({ type, toolCallId: type, state: 'output-available', input, output }) as UIMessage['parts'][number];

it('summarises what each finished tool found, from its real output', () => {
  const message = {
    id: 'm',
    role: 'assistant',
    parts: [
      tool('tool-get_agent', {
        revision: 4,
        agent: { name: 'Riverside', nodes: [{ tools: [] }, { tools: ['check_availability'] }] },
      }),
      tool('tool-get_calls', {
        calls: [
          { outcome: 'failed', reported: true },
          { outcome: 'successful', reported: false },
        ],
      }),
      tool('tool-get_call', {
        id: 'c1',
        title: 'Emergency',
        outcome: 'failed',
        transcript: [{}, {}],
        graph_path: ['start', 'end'],
      }),
      tool(
        'tool-propose_agent_patch',
        { valid: true, quality_warnings: [] },
        { operations: [{ node: 'a' }, { node: 'a' }, { node: 'b' }] },
      ),
    ],
  } as UIMessage;
  expect(copilotActivities([message], false).map(step => step.result)).toEqual([
    'Riverside: 2 steps, 1 using tools · revision 4',
    '2 calls: 1 failed, 1 reported by the client',
    'Emergency: failed, 2 turns, start → end',
    'Valid: 3 changes across 2 steps',
  ]);
});
