import { expect, test } from '@playwright/test';
import { constructProposal } from '../lib/agent/proposals';
import { nodeSchema } from '../lib/agent/schema';

// Fresh storage, new agent, straight to chat: nothing was edited, so Apply must be available.
test('a proposal for a freshly created agent can be applied without touching Details', async ({ page }) => {
  await page.route('**/api/copilot', async route => {
    const { snapshot } = route.request().postDataJSON();
    const patch = {
      agentId: snapshot.id,
      baseRevision: snapshot.revision,
      outcome: 'Car service front desk',
      explanation: 'Builds the workflow from the pasted guidelines.',
      behavior: 'Greets, triages, books.',
      guidelines: 'Handle every call: greet, triage, book.',
      operations: [
        {
          type: 'add_node',
          value: nodeSchema.parse({
            name: 'book_service',
            end: true,
            task_messages: [{ role: 'developer', content: 'Book the service.' }],
          }),
        },
        {
          type: 'add_edge',
          node: snapshot.agent.initial_node,
          value: {
            function: 'to_booking',
            description: 'Caller wants service.',
            target: 'book_service',
            properties: {},
            required: [],
          },
        },
        { type: 'update_node', node: snapshot.agent.initial_node, changes: { end: false } },
      ],
    };
    const proposal = await constructProposal(snapshot, patch, async () => {});
    const chunks = [
      { type: 'start', messageId: 'm' },
      { type: 'tool-input-available', toolCallId: 'read', toolName: 'get_agent', input: {} },
      { type: 'tool-output-available', toolCallId: 'read', output: snapshot },
      { type: 'tool-input-available', toolCallId: 'patch', toolName: 'propose_agent_patch', input: patch },
      { type: 'tool-output-available', toolCallId: 'patch', output: { valid: true, proposal } },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: 'Review this.' },
      { type: 'text-end', id: 't' },
      { type: 'finish', finishReason: 'stop' },
    ];
    await route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
      body: chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n',
    });
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
  await page
    .getByLabel('Message Copilot')
    .fill('Build the agent from these guidelines.\n- Primary goal: handle every call.');
  await page.getByLabel('Message Copilot').press('Enter');
  const apply = page.getByRole('button', { name: 'Apply', exact: true });
  await expect(apply).toBeVisible();
  await expect(page.getByText('Save or cancel your draft')).toHaveCount(0);
  await expect(apply).toBeEnabled();
});

test('applying a proposal with guidelines fills Client guidelines', async ({ page }) => {
  await page.route('**/api/copilot', async route => {
    const { snapshot } = route.request().postDataJSON();
    const patch = {
      agentId: snapshot.id,
      baseRevision: snapshot.revision,
      outcome: 'Front desk',
      explanation: 'Builds from the interview.',
      behavior: 'Greets.',
      guidelines: 'Handle every call: greet, triage, book.',
      operations: [{ type: 'update_agent', changes: { name: 'Front Desk' } }],
    };
    const proposal = await constructProposal(snapshot, patch, async () => {});
    const chunks = [
      { type: 'start', messageId: 'm' },
      { type: 'tool-input-available', toolCallId: 'read', toolName: 'get_agent', input: {} },
      { type: 'tool-output-available', toolCallId: 'read', output: snapshot },
      { type: 'tool-input-available', toolCallId: 'patch', toolName: 'propose_agent_patch', input: patch },
      { type: 'tool-output-available', toolCallId: 'patch', output: { valid: true, proposal } },
      { type: 'finish', finishReason: 'stop' },
    ];
    await route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
      body: chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n',
    });
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
  await page.getByLabel('Message Copilot').fill('Build it.');
  await page.getByLabel('Message Copilot').press('Enter');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(page.getByText('Handle every call: greet, triage, book.', { exact: true })).toBeVisible();
});
