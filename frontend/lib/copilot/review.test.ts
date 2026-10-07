import { expect, test } from 'vitest';
import { z } from 'zod';
import { MockLanguageModelV3 } from 'ai/test';
import { parseCopilotRequest, reviewBehavior } from './server';
import { groundedReviewSchema } from '../agent/proposals';
import { loadAgentFixture } from '../fixtures';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const toolStep = {
  content: [{ type: 'tool-call' as const, toolCallId: 'c1', toolName: 'get_agent', input: '{}' }],
  finishReason: { unified: 'tool-calls' as const, raw: undefined },
  usage,
  warnings: [],
};
const textStep = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage,
  warnings: [],
});
const guidelines = 'Accept short answers such as "yes". Never invent availability.';
const snapshot = { id: 'a', revision: 1, agent: loadAgentFixture('clinic-scheduler'), guidelines };
const input = () =>
  parseCopilotRequest({
    snapshot,
    intent: 'review',
    messages: [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'Review' }] }],
  });
const valid = JSON.stringify({
  summary: 'Reviewed',
  behaviors: [
    {
      behavior: 'Availability',
      excerpt: 'Never invent availability.',
      references: [],
      finding: 'Aligned',
      status: 'aligned',
      clarification: null,
    },
  ],
});

test('review makes one bounded re-attempt when the model returns a malformed review', async () => {
  const model = new MockLanguageModelV3({
    doGenerate: [toolStep, textStep('not json'), toolStep, textStep(valid)],
  });
  const { review } = await reviewBehavior(await input(), { model });
  expect(review.behaviors[0].excerpt).toBe('Never invent availability.');
  expect(model.doGenerateCalls).toHaveLength(4);
});

test('review stops after the second malformed attempt instead of looping', async () => {
  const model = new MockLanguageModelV3({
    doGenerate: [toolStep, textStep('nope'), toolStep, textStep('still nope')],
  });
  await expect(reviewBehavior(await input(), { model })).rejects.toThrow();
  expect(model.doGenerateCalls).toHaveLength(4);
});

// OpenAI strict structured outputs reject these in enum literals; any guideline text must still yield a valid schema.
const hostile = [
  'Accept "yes" or "no".\n\nUse C:\\temp.\tTabbed.',
  'Same sentence.',
  Array.from({ length: 600 }, (_, i) => `Rule ${i} says "x${i}".`).join('\n'),
  '“Curly quotes” and — dashes, émojis 🙂.',
];
test.each(hostile)('review schema stays within provider strict-mode limits for any guidelines', text => {
  const json = z.toJSONSchema(groundedReviewSchema(text), { io: 'input' }) as unknown as {
    properties: { behaviors: { items: { properties: { excerpt: { enum: string[] } } } } };
  };
  const options = json.properties.behaviors.items.properties.excerpt.enum;
  expect(options.length).toBeGreaterThan(0);
  expect(options.length).toBeLessThanOrEqual(250);
  expect(new Set(options).size).toBe(options.length);
  expect(options.some(option => /["\\\u0000-\u001f]/.test(option))).toBe(false);
  // Anything the model can pick maps back to text that really is in the guidelines.
  const parsed = groundedReviewSchema(text).parse({
    summary: 's',
    behaviors: options.slice(0, 6).map(excerpt => ({
      behavior: 'b',
      excerpt,
      references: [],
      finding: 'f',
      status: 'aligned',
      clarification: null,
    })),
  });
  for (const item of parsed.behaviors) expect(text.includes(item.excerpt)).toBe(true);
});
