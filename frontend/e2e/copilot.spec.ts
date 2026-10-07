import { expect, test, type Page } from '@playwright/test';
import { openCalls, openDetails } from './seed';
import { constructProposal } from '../lib/agent/proposals';
import { loadAgentFixture, loadDemoContext } from '../lib/fixtures';
import { STORAGE_KEY, type SavedAgent } from '../lib/agent/repository';
const base: SavedAgent = {
  id: 'clinic-scheduler',
  revision: 1,
  agent: loadAgentFixture('clinic-scheduler'),
  guidelines: loadDemoContext().guidelines[0].text,
};
const patch = {
  agentId: base.id,
  baseRevision: 1,
  outcome: 'Existing patients skip insurance',
  explanation: 'Existing patients should not be asked for insurance.',
  behavior: 'Insurance collection',
  operations: [
    {
      type: 'update_node',
      node: 'collect_details',
      changes: {
        task_messages: [
          {
            role: 'developer',
            content:
              'Collect name, DOB and patient type. Ask insurance only for new patients. Existing patients skip insurance.',
          },
        ],
      },
    },
  ],
};

test('retry repeats a failed behavior review and preserves a newly typed draft', async ({ page }) => {
  await seed(page);
  let attempts = 0;
  let originalParts: unknown;
  await page.route('**/api/copilot', async route => {
    const request = route.request().postDataJSON();
    expect(request.intent).toBe('review');
    expect(request.snapshot).toEqual(base);
    const parts = request.messages.at(-1).parts;
    if (++attempts === 1) {
      originalParts = parts;
      await route.fulfill({ status: 503, body: 'Temporarily unavailable' });
      return;
    }
    expect(parts).toEqual(originalParts);
    // A retry replaces the failed request; it must not leave the same user turn in the history twice.
    expect(request.messages.filter((message: { role: string }) => message.role === 'user')).toHaveLength(1);
    const chunks = [
      { type: 'start', messageId: 'retried-review' },
      { type: 'text-start', id: 'review-text' },
      { type: 'text-delta', id: 'review-text', delta: 'Review request recovered.' },
      { type: 'text-end', id: 'review-text' },
      { type: 'finish', finishReason: 'stop' },
    ];
    await route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
      body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
    });
  });
  await page.goto('/');
  await openDetails(page);
  await page.getByRole('button', { name: 'Review behavior', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry response' })).toBeVisible();
  await page.getByLabel('Message Copilot').fill('Keep this next question');
  await page.getByRole('button', { name: 'Retry response' }).click();
  await expect(page.getByText('Review request recovered.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Message Copilot')).toHaveValue('Keep this next question');
  expect(attempts).toBe(2);
  expect(
    await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).agents[0].revision, STORAGE_KEY),
  ).toBe(1);
});
async function seed(page: Page) {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: STORAGE_KEY,
    raw: JSON.stringify({
      version: 1,
      selectedId: base.id,
      agents: [
        base,
        { ...base, id: 'new-agent', guidelines: '', agent: { ...base.agent, name: 'Untitled agent' } },
      ],
    }),
  });
}
async function mockProposal(page: Page) {
  const proposal = await constructProposal(base, patch, async () => {});
  await page.route('**/api/copilot', async route => {
    const request = route.request().postDataJSON();
    expect(request.snapshot).toEqual(base);
    const chunks = [
      { type: 'start', messageId: 'assistant-1' },
      { type: 'tool-input-available', toolCallId: 'read', toolName: 'get_agent', input: {} },
      { type: 'tool-output-available', toolCallId: 'read', output: base },
      { type: 'tool-input-available', toolCallId: 'patch', toolName: 'propose_agent_patch', input: patch },
      { type: 'tool-output-available', toolCallId: 'patch', output: { valid: true, proposal } },
      { type: 'text-start', id: 'text' },
      { type: 'text-delta', id: 'text', delta: 'Review this targeted change before Apply.' },
      { type: 'text-end', id: 'text' },
      { type: 'finish', finishReason: 'stop' },
    ];
    await route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
      body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
    });
  });
  return proposal;
}
async function send(page: Page) {
  await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
  await page.getByLabel('Message Copilot').fill('Existing patients should skip insurance.');
  await page.getByLabel('Message Copilot').press('Enter');
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
}
for (const width of [1440, 390])
  test(`targeted proposal, exact Apply and retained chat at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    const proposal = await mockProposal(page);
    await page.goto('/');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await openDetails(page);
    await page.screenshot({ path: info.outputPath(`details-${width}.png`) });
    await send(page);
    const review = page.getByRole('region', { name: 'Proposal review', exact: true });
    await expect(review.getByText('Instructions updated', { exact: true })).toBeVisible();
    await expect(review.getByText('Why these changes', { exact: true })).toBeVisible();
    await expect(review.getByText(patch.explanation, { exact: true })).not.toBeVisible();
    await review.getByRole('button', { name: 'View changes to Collect details' }).click();
    await expect(review.getByText('Instructions', { exact: true })).toBeVisible();
    await expect(review.locator('ins').first()).toBeVisible();
    await review.getByRole('button', { name: 'Show step on canvas' }).click();
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByLabel('Message Copilot').fill('Keep this draft');
    await page.getByRole('tab', { name: 'Details', exact: true }).click();
    await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
    await expect(page.getByLabel('Message Copilot')).toHaveValue('Keep this draft');
    await page.screenshot({ path: info.outputPath(`copilot-${width}.png`) });
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('Applied', { exact: true })).toBeVisible();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).agents[0], STORAGE_KEY);
    expect(saved.revision).toBe(2);
    expect(saved.agent).toEqual(proposal.candidate);
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Test Call', exact: true }).last().click();
    if (width < 768) await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await expect(page.getByText(/clinic-scheduler · Revision 2/)).toBeVisible();
    await page.getByRole('button', { name: 'Builder', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await openDetails(page);
    await expect(page.getByLabel('Message Copilot')).toHaveValue('Keep this draft');
  });
test('draft blocking, cancel and Dismiss', async ({ page }) => {
  await seed(page);
  await mockProposal(page);
  await page.goto('/');
  await send(page);
  await page.getByRole('button', { name: 'Show current workspace', exact: true }).click();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByLabel('Agent name').fill('Manual draft');
  await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  expect(
    await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).agents[0].revision, STORAGE_KEY),
  ).toBe(1);
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(page.getByLabel('Agent name')).toHaveValue('Manual draft');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
});
test('recent call ownership, transcript retained during graph navigation', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await openCalls(page);
  await page.getByRole('button', { name: /Reported Friday booking issue/ }).click();
  await expect(page.getByText('Transcript', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'offer_times', exact: true }).click();
  await expect(page.getByText('Transcript', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to recent calls' }).click();
  await page.getByLabel('Saved agent', { exact: true }).click();
  await page
    .getByRole('group', { name: 'Agents' })
    .getByRole('button', { name: /^Untitled agent/ })
    .click();
  await openCalls(page);
  await expect(page.getByText('No recent calls for this agent.')).toBeVisible();
});

test('guideline-only save invalidates proposal while preserving conversation', async ({ page }) => {
  await seed(page);
  await mockProposal(page);
  await page.goto('/');
  await send(page);
  await page.getByRole('button', { name: 'Show current workspace', exact: true }).click();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByRole('button', { name: 'Edit guidelines', exact: true }).click();
  await page.getByLabel('Client guidelines').fill('New saved requirements');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
  await expect(page.getByText('Out of date', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
  await expect(page.getByText('Review this targeted change before Apply.', { exact: true })).toBeVisible();
});
test('failed Apply retains saved revision and keeps the reviewed candidate actionable', async ({ page }) => {
  await seed(page);
  const proposal = await mockProposal(page);
  await page.goto('/');
  await send(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'prosper.agents.v1') throw new Error('Storage full');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Storage full' })).toBeVisible();
  expect(
    await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).agents[0].revision, STORAGE_KEY),
  ).toBe(1);
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  expect(proposal.baseRevision).toBe(1);
});

test('rejected validation is shown as failed activity without an Apply action', async ({ page }) => {
  await seed(page);
  await page.route('**/api/copilot', route => {
    const chunks = [
      { type: 'start', messageId: 'rejected-proposal' },
      {
        type: 'tool-input-available',
        toolCallId: 'invalid-patch',
        toolName: 'propose_agent_patch',
        input: patch,
      },
      {
        type: 'tool-output-available',
        toolCallId: 'invalid-patch',
        output: { valid: false, error: 'The scheduling step has no path to an end step.' },
      },
      { type: 'finish', finishReason: 'stop' },
    ];
    return route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
      body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
    });
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
  await page.getByLabel('Message Copilot').fill('Change the scheduling step.');
  await page.getByLabel('Message Copilot').press('Enter');
  // A failed step opens the work block by itself.
  await expect(
    page.getByRole('tabpanel', { name: 'Copilot' }).getByText('Failed', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('The scheduling step has no path to an end step.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).agents[0].revision, STORAGE_KEY),
  ).toBe(1);
});

for (const width of [1440, 390])
  test(`behavior review proposes all mismatches in one request at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    let requests = 0;
    const proposal = await constructProposal(base, patch, async () => {});
    await page.route('**/api/copilot', async route => {
      const request = route.request().postDataJSON();
      requests++;
      const review = {
        agentId: base.id,
        revision: base.revision,
        summary:
          '**Two potential gaps** in the saved workflow.\n\n' +
          'The model compares the workflow with the saved guidelines. '.repeat(50),
        behaviors: [
          {
            behavior: 'Patient details',
            finding: 'Collect the required patient details.',
            excerpt: base.guidelines,
            references: [],
            status: 'potential_mismatch',
            clarification: null,
          },
          {
            behavior: 'Insurance routing',
            finding: 'Only new patients should provide insurance.',
            excerpt: base.guidelines,
            references: [],
            status: 'potential_mismatch',
            clarification: null,
          },
          {
            behavior: 'Alternatives',
            finding: 'Requires clarification.',
            excerpt: base.guidelines,
            references: [],
            status: 'ambiguous',
            clarification: 'Which alternatives should be offered?',
          },
        ],
      };
      if (requests > 1) {
        expect(request.intent).toBe('chat');
        const prompt = request.messages.at(-1).parts[0].text;
        expect(prompt).toContain('Patient details');
        expect(prompt).toContain('Insurance routing');
        expect(prompt).not.toContain('Alternatives');
        expect(prompt).toContain('one atomic propose_agent_patch batch');
      }
      const chunks =
        requests === 1
          ? [
              { type: 'start', messageId: 'review' },
              { type: 'data-review', data: review },
              { type: 'finish', finishReason: 'stop' },
            ]
          : [
              { type: 'start', messageId: 'batch' },
              {
                type: 'tool-input-available',
                toolCallId: 'batch-patch',
                toolName: 'propose_agent_patch',
                input: patch,
              },
              { type: 'tool-output-available', toolCallId: 'batch-patch', output: { valid: true, proposal } },
              { type: 'finish', finishReason: 'stop' },
            ];
      await route.fulfill({
        contentType: 'text/event-stream',
        headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
        body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
      });
    });
    await page.goto('/');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await openDetails(page);
    await page.getByRole('button', { name: 'Review behavior', exact: true }).click();
    const bulk = page.getByRole('button', { name: 'Propose all changes', exact: true });
    await expect(bulk).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Behavior review', exact: true })).toBeInViewport();
    const reviewRegion = page.getByRole('region', { name: 'Behavior review', exact: true });
    const overview = reviewRegion
      .locator('details')
      .filter({ has: page.getByText('Read model overview', { exact: true }) });
    await expect(overview).not.toHaveAttribute('open');
    await reviewRegion.getByText('Read model overview', { exact: true }).click();
    await expect(overview.locator('strong')).toHaveText('Two potential gaps');
    await reviewRegion.getByText('Read model overview', { exact: true }).click();
    const finding = reviewRegion.locator('summary').filter({ hasText: 'Patient details' });
    await finding.focus();
    await page.keyboard.press('Enter');
    await expect(
      reviewRegion.getByText('Collect the required patient details.', { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Enter');
    await reviewRegion
      .getByRole('heading', { name: 'Behavior review', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`bulk-review-${width}.png`) });
    await bulk.click();
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
    await expect(bulk).toBeEnabled();
    expect(requests).toBe(2);
    expect(
      await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).agents[0].revision, STORAGE_KEY),
    ).toBe(1);
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('Applied', { exact: true })).toBeVisible();
    await expect(bulk).toBeDisabled();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).agents[0], STORAGE_KEY);
    expect(saved.revision).toBe(2);
    expect(saved.agent).toEqual(proposal.candidate);
  });

for (const width of [1440, 390])
  test(`one block says what Copilot is doing, with elapsed time, then collapses to how long it took at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    await mockProposal(page);
    // Registered last, so it runs first: hold the response, then hand it to the mock above.
    await page.route('**/api/copilot', async route => {
      await new Promise(resolve => setTimeout(resolve, 2500));
      await route.fallback();
    });
    await page.goto('/');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
    await page.getByLabel('Message Copilot').fill('Existing patients should skip insurance.');
    await page.getByLabel('Message Copilot').press('Enter');
    const block = page.getByRole('article', { name: 'Copilot response' });
    await expect(block).toContainText('Thinking…');
    await expect(block.getByRole('timer')).toBeVisible();
    // Progress lives in one place: nothing above the composer repeats it.
    await expect(page.getByRole('timer')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath(`progress-${width}.png`) });
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
    await expect(page.getByRole('timer')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Worked for \d+s/ })).toBeVisible();
  });
