import { openDetails } from './seed';
import { expect, test, type Page } from '@playwright/test';
import { constructProposal, type Proposal } from '../lib/agent/proposals';
import type { AgentOperation } from '../lib/agent/operations';
import { nodeSchema } from '../lib/agent/schema';
import { minimalAgent, savedAgentSchema, STORAGE_KEY, type SavedAgent } from '../lib/agent/repository';
import { loadAgentFixture, loadDemoContext } from '../lib/fixtures';

const existing: SavedAgent = {
  id: 'clinic-scheduler',
  revision: 1,
  agent: loadAgentFixture('clinic-scheduler'),
  guidelines: loadDemoContext().guidelines[0].text,
};
const followUpInstructions =
  'Explain how the caller can contact the clinic for a follow-up, then say goodbye.';
const incremental: AgentOperation[] = [
  {
    type: 'add_node',
    value: nodeSchema.parse({
      name: 'follow_up',
      end: true,
      task_messages: [{ role: 'developer', content: followUpInstructions }],
    }),
  },
  {
    type: 'add_edge',
    node: 'offer_times',
    value: {
      function: 'request_follow_up',
      description: 'The caller asks the clinic to follow up instead of selecting a slot.',
      target: 'follow_up',
      properties: {},
      required: [],
    },
  },
];
const banner = (page: Page) => page.getByRole('region', { name: 'Canvas proposal preview', exact: true });
const canvas = (page: Page) => page.locator('.react-flow:visible');
const storage = (page: Page) => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
async function saved(page: Page) {
  return savedAgentSchema.parse(
    await page.evaluate(key => {
      const document = JSON.parse(localStorage.getItem(key)!);
      return document.agents.find((item: { id: string }) => item.id === document.selectedId);
    }, STORAGE_KEY),
  );
}
async function seed(page: Page) {
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: STORAGE_KEY,
    raw: JSON.stringify({ version: 1, selectedId: existing.id, agents: [existing] }),
  });
}
async function mockProposal(
  page: Page,
  base: SavedAgent,
  operations: AgentOperation[],
  ending: 'complete' | 'invalid' | 'interrupted' = 'complete',
) {
  const input = {
    agentId: base.id,
    baseRevision: base.revision,
    outcome: 'Review the proposed workflow',
    explanation: 'This synthetic proposal exercises candidate inspection before saving.',
    behavior: 'Scheduling workflow',
    operations,
  };
  // Synthetic tool boundary, as in copilot.spec. Apply still uses the real local Python validator.
  const proposal = await constructProposal(base, input, async () => {});
  await page.route('**/api/copilot', async route => {
    expect(route.request().postDataJSON().snapshot).toEqual(base);
    const chunks: unknown[] = [
      { type: 'start', messageId: `canvas-${ending}` },
      { type: 'tool-input-available', toolCallId: 'canvas-patch', toolName: 'propose_agent_patch', input },
      {
        type: 'tool-output-available',
        toolCallId: 'canvas-patch',
        output:
          ending === 'invalid'
            ? { valid: false, error: 'Synthetic candidate validation failed.' }
            : { valid: true, proposal },
      },
      ...(ending === 'interrupted'
        ? [{ type: 'error', errorText: 'Synthetic stream interrupted before completion.' }]
        : [{ type: 'finish', finishReason: 'stop' }]),
    ];
    await route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
      body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
    });
  });
  return proposal;
}
async function send(page: Page, ready = true) {
  await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
  await page.getByLabel('Message Copilot', { exact: true }).fill('Build the proposed workflow for review.');
  await page.getByLabel('Message Copilot', { exact: true }).press('Enter');
  if (ready) await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeVisible();
}
async function expectExactApply(page: Page, base: SavedAgent, proposal: Proposal) {
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByText('Applied', { exact: true })).toBeVisible();
  expect(await saved(page)).toEqual({ ...base, revision: base.revision + 1, agent: proposal.candidate });
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Inspect on canvas', exact: true })).toHaveCount(0);
}

for (const width of [1440])
  test(`complete candidate graph from a fresh scaffold is inspectable before exact Apply at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Inspect start', exact: true })).toBeVisible();
    const base = await saved(page);
    expect(base.agent).toEqual(minimalAgent());
    const target = loadAgentFixture('clinic-scheduler');
    const operations: AgentOperation[] = [
      ...target.nodes.map(value => ({ type: 'add_node' as const, value })),
      {
        type: 'update_agent',
        changes: { name: target.name, persona: target.persona, initial_node: target.initial_node },
      },
      { type: 'delete_node', node: 'start' },
    ];
    const proposal = await mockProposal(page, base, operations);
    const before = await storage(page);
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await send(page);
    // Desktop reveals the candidate automatically; the contextual step action also reveals it on mobile.
    if (width >= 768) await expect(banner(page)).toContainText('Proposed workflow');
    await page.getByRole('button', { name: 'View changes to Collect details' }).click();
    await page.getByRole('button', { name: 'Show step on canvas', exact: true }).click();
    await expect(banner(page)).toBeVisible();
    await expect(canvas(page).locator('.react-flow__node')).toHaveCount(target.nodes.length);
    await expect(canvas(page).getByText('Proposed · New', { exact: true })).toHaveCount(target.nodes.length);
    await expect(canvas(page).getByRole('button', { name: /^Add step/ })).toHaveCount(0);
    await expect(canvas(page).getByRole('button', { name: /^Delete / })).toHaveCount(0);
    await expect(canvas(page).getByRole('button', { name: 'Inspect start', exact: true })).toHaveCount(0);
    expect(await storage(page)).toBe(before);
    await page.screenshot({ path: info.outputPath(`candidate-canvas-${width}.png`) });

    await canvas(page).getByRole('button', { name: 'Inspect collect_details', exact: true }).click();
    const inspector = page.getByRole('region', { name: 'Proposed details', exact: true });
    await expect(inspector).toBeVisible(); // Node inspection reveals Details on mobile too.
    await expect(inspector.getByRole('heading', { name: 'Collect details', exact: true })).toBeVisible();
    await expect(inspector.getByRole('textbox')).toHaveCount(0);
    await expect(inspector).toContainText(String(target.nodes[0].task_messages[0].content));
    await page.screenshot({ path: info.outputPath(`candidate-details-${width}.png`) });
    await inspector.getByRole('button', { name: 'Review proposal in Copilot', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
    expect(await storage(page)).toBe(before);
    await expectExactApply(page, base, proposal);
    await page.getByRole('button', { name: 'Test Call', exact: true }).last().click();
    if (width < 768) await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await expect(page.getByText(`Saved agent ${base.id} · Revision 2`, { exact: true })).toBeVisible();
  });

test('incremental preview marks only affected elements, preserves the draft, and Dismiss restores it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await mockProposal(page, existing, incremental);
  await page.goto('/');
  await openDetails(page);
  await page.getByLabel('Agent name', { exact: true }).fill('Keep this manual draft');
  const before = await storage(page);
  await send(page);
  await expect(banner(page)).toContainText('Proposed workflow');
  await expect(canvas(page).getByRole('button', { name: 'Inspect follow_up', exact: true })).toContainText(
    'Proposed · New',
  );
  await expect(canvas(page).getByRole('button', { name: 'Inspect offer_times', exact: true })).toContainText(
    'Proposed · Updated',
  );
  await expect(
    canvas(page).getByRole('button', { name: 'Inspect collect_details', exact: true }),
  ).not.toContainText('Proposed ·');
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await banner(page).getByRole('button', { name: 'Show current workspace', exact: true }).click();
  await expect(canvas(page).getByRole('button', { name: 'Inspect follow_up', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(page.getByLabel('Agent name', { exact: true })).toHaveValue('Keep this manual draft');
  await banner(page).getByRole('button', { name: 'Show proposal', exact: true }).click();
  await canvas(page).getByRole('button', { name: 'Inspect follow_up', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Proposed details', exact: true })).toContainText(
    followUpInstructions,
  );
  await banner(page).getByRole('button', { name: 'Review proposal', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(banner(page)).toHaveCount(0);
  await expect(canvas(page).getByRole('button', { name: 'Inspect follow_up', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(page.getByLabel('Agent name', { exact: true })).toHaveValue('Keep this manual draft');
  expect(await storage(page)).toBe(before);
});

test('saving manual guidelines invalidates and removes a candidate canvas', async ({ page }) => {
  await seed(page);
  await mockProposal(page, existing, incremental);
  await page.goto('/');
  await send(page);
  await expect(banner(page)).toBeVisible();
  await banner(page).getByRole('button', { name: 'Show current workspace', exact: true }).click();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByRole('button', { name: 'Edit guidelines', exact: true }).click();
  await page.getByLabel('Client guidelines', { exact: true }).fill('Updated saved guidelines.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  await expect(canvas(page).getByRole('button', { name: 'Inspect follow_up', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
  await expect(page.getByText('Out of date', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspect on canvas', exact: true })).toHaveCount(0);
  expect(await saved(page)).toEqual({ ...existing, revision: 2, guidelines: 'Updated saved guidelines.' });
});

for (const ending of ['invalid', 'interrupted'] as const)
  test(`${ending} tool output never exposes a candidate canvas`, async ({ page }) => {
    await seed(page);
    await mockProposal(page, existing, incremental, ending);
    await page.goto('/');
    const before = await storage(page);
    await send(page, false);
    if (ending === 'interrupted')
      await expect(page.getByText('Interrupted', { exact: true }).filter({ visible: true })).toHaveCount(1);
    else {
      // A failed step opens the work block by itself.
      await expect(page.getByText('Synthetic candidate validation failed.', { exact: true })).toBeVisible();
    }
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Inspect on canvas', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
    await expect(canvas(page).getByRole('button', { name: 'Inspect follow_up', exact: true })).toHaveCount(0);
    expect(await storage(page)).toBe(before);
  });

for (const width of [1440, 390])
  test(`grouped review handles long step names and inline diffs at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await seed(page);
    const longName = 'follow_up_with_the_patient_about_their_appointment_and_accessibility_requirements';
    const operations: AgentOperation[] = [
      {
        type: 'update_agent',
        changes: { persona: `${existing.agent.persona} Keep follow-up instructions brief.` },
      },
      {
        type: 'update_node',
        node: 'collect_details',
        changes: {
          task_messages: [
            {
              role: 'developer',
              content: 'Collect the patient details and confirm any accessibility requirements.',
            },
          ],
        },
      },
      ...incremental.map(operation =>
        operation.type === 'add_node'
          ? { ...operation, value: { ...operation.value, name: longName } }
          : operation.type === 'add_edge'
            ? { ...operation, value: { ...operation.value, target: longName } }
            : operation,
      ),
    ];
    const proposal = await mockProposal(page, existing, operations);
    await page.goto('/');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    const before = await storage(page);
    await send(page);
    const review = page.getByRole('region', { name: 'Proposal review', exact: true });
    await expect(review.getByRole('region', { name: 'Global changes' })).toBeVisible();
    await expect(review.getByRole('region', { name: 'Step changes' }).getByRole('listitem')).toHaveCount(3);
    await expect(review.getByText('Instructions updated', { exact: true })).toBeVisible();
    await expect(review.getByText('1 transition added', { exact: true })).toBeVisible();
    await expect(review.getByText('Step added', { exact: true })).toBeVisible();
    await review.evaluate(element => element.scrollIntoView({ block: 'start' }));
    expect(await review.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`proposal-review-${width}.png`) });
    const view = review.getByRole('button', { name: 'View changes to Collect details' });
    await view.focus();
    await page.keyboard.press('Enter');
    await expect(review.getByRole('button', { name: 'Hide changes to Collect details' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(review.locator('ins').filter({ visible: true }).first()).toBeVisible();
    expect(await storage(page)).toBe(before);
    await page.screenshot({ path: info.outputPath(`proposal-review-expanded-${width}.png`) });
    await review.getByRole('button', { name: 'Hide changes to Collect details' }).click();
    await review.getByRole('button', { name: 'View changes to Offer times' }).click();
    await review.getByRole('button', { name: 'Show step on canvas', exact: true }).click();
    const selected = canvas(page).locator('.react-flow__node.selected');
    await expect(selected).toHaveAttribute('data-id', 'offer_times');
    await expect(selected).toBeInViewport();
    await expect
      .poll(async () => {
        const nodeBounds = await selected.boundingBox();
        const graphBounds = await canvas(page).boundingBox();
        if (!nodeBounds || !graphBounds) return Infinity;
        return Math.abs(nodeBounds.y + nodeBounds.height / 2 - graphBounds.y - graphBounds.height / 2);
      })
      .toBeLessThan(50);
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expectExactApply(page, existing, proposal);
  });
