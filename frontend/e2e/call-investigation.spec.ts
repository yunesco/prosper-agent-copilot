import { openCalls } from './seed';
import { expect, test, type Page } from '@playwright/test';
import { STORAGE_KEY, type SavedAgent } from '../lib/agent/repository';
import { loadAgentFixture, loadDemoContext } from '../lib/fixtures';
import type { ProductionCall } from '../lib/platform/schema';

const deployed: SavedAgent = {
  id: 'clinic-scheduler',
  revision: 1,
  agent: loadAgentFixture('clinic-scheduler'),
  guidelines: loadDemoContext().guidelines[0].text,
};
const friday: ProductionCall = loadDemoContext().calls.find(call => call.id === 'new-patient-friday')!;

async function seedDeployed(page: Page) {
  const raw = JSON.stringify({ version: 1, selectedId: deployed.id, agents: [deployed] });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: STORAGE_KEY,
    value: raw,
  });
}

// A streamed Copilot answer that really "read" the call, then cites turn 3 and an unread turn 9.
function investigationStream() {
  const output = {
    ...friday,
    transcript: friday.transcript.map((turn, index) => ({ turn: index + 1, ...turn })),
  };
  const chunks = [
    { type: 'start', messageId: 'investigation' },
    {
      type: 'tool-input-available',
      toolCallId: 'read-call',
      toolName: 'get_call',
      input: { call_id: friday.id },
    },
    { type: 'tool-output-available', toolCallId: 'read-call', output },
    { type: 'text-start', id: 'answer' },
    {
      type: 'text-delta',
      id: 'answer',
      delta:
        'The agent offered Friday to a new patient ([turn 3](call:new-patient-friday#3)); the cause is in [offer_times](graph:offer_times). It also claims [turn 9](call:new-patient-friday#9).',
    },
    { type: 'text-end', id: 'answer' },
    { type: 'finish', finishReason: 'stop' },
  ];
  return chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
}

for (const width of [1440, 390]) {
  test(`investigate a failed call, then follow a verified citation to its transcript turn at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await seedDeployed(page);
    let prompt = '';
    await page.route('**/api/copilot', async route => {
      const request = route.request().postDataJSON();
      prompt = request.messages.at(-1).parts[0].text;
      expect(request.snapshot).toEqual(deployed);
      await route.fulfill({
        contentType: 'text/event-stream',
        headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
        body: investigationStream(),
      });
    });
    await page.goto('/');
    await openCalls(page);
    await page.getByRole('button', { name: /Reported Friday booking issue/ }).click();
    await page.getByRole('button', { name: 'Investigate with Copilot' }).click();
    await expect(page.getByRole('article', { name: 'Copilot response' })).toContainText('offered Friday');
    expect(prompt).toContain('new-patient-friday');

    // The tool call is in the turn's work block (collapsed once done); a citation to a turn never read is not a link.
    await page.getByRole('button', { name: /^Worked/ }).click();
    await expect(page.getByText('Read call transcript')).toBeVisible();
    await expect(page.getByRole('button', { name: 'turn 9' })).toHaveCount(0);
    await expect(page.getByText('turn 9 (unverified)')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`investigation-${width}.png`) });

    await page.getByRole('button', { name: 'turn 3' }).click();
    const cited = page.getByRole('region', { name: 'Call details' }).getByRole('listitem').nth(2);
    await expect(cited).toHaveAttribute('aria-current', 'true');
    await expect(cited).toContainText('Friday at 2 PM');
    await expect(cited).toBeInViewport();
  });
}
