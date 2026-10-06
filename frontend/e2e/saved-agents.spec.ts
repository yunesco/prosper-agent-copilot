import { revealAgentFields } from './seed';
import { expect, test } from '@playwright/test';
import { STORAGE_KEY } from '../lib/agent/repository';

for (const width of [1440, 390]) {
  test(`saved agents, combined drafts, switch decisions and reload at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const selector = page.getByLabel('Saved agent', { exact: true });
    await expect(selector).toContainText('New / generated agent');
    const id = await page.evaluate(
      key => JSON.parse(localStorage.getItem(key)!).selectedId as string,
      STORAGE_KEY,
    );
    expect(id).not.toBe('clinic-scheduler');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await revealAgentFields(page);
    await page.getByLabel('Client guidelines').fill('New agent saved guidelines');
    await revealAgentFields(page);
    await page.getByLabel('Agent instructions', { exact: true }).fill('Saved new instructions');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`saved-agent-${width}.png`) });
    await revealAgentFields(page);
    await page.getByLabel('Client guidelines').fill('Discard this');
    await selector.click();
    await page.getByRole('option', { name: 'Mocked existing deployed agent', exact: true }).click();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(selector).toContainText('New / generated agent');
    await revealAgentFields(page);
    await expect(page.getByLabel('Client guidelines')).toHaveValue('Discard this');
    await selector.click();
    await page.getByRole('option', { name: 'Mocked existing deployed agent', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel edits and switch', exact: true }).click();
    await expect(selector).toContainText('Mocked existing deployed agent');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await revealAgentFields(page);
    await page.getByLabel('Client guidelines').fill('Clinic saved guidelines');
    await selector.click();
    await page.getByRole('option', { name: 'New / generated agent', exact: true }).click();
    await page.getByRole('button', { name: 'Save and switch', exact: true }).click();
    await expect(selector).toContainText('New / generated agent');
    await page.reload();
    await expect(selector).toContainText('New / generated agent');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await revealAgentFields(page);
    await expect(page.getByLabel('Client guidelines')).toHaveValue('New agent saved guidelines');
    await revealAgentFields(page);
    await expect(page.getByLabel('Agent instructions', { exact: true })).toHaveValue(
      'Saved new instructions',
    );
    await selector.click();
    await page.getByRole('option', { name: 'Mocked existing deployed agent', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await revealAgentFields(page);
    await expect(page.getByLabel('Client guidelines')).toHaveValue('Clinic saved guidelines');
    await page.reload();
    await expect(selector).toContainText('Mocked existing deployed agent');
    const doc = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
    expect(doc.agents.map((a: { revision: number }) => a.revision)).toEqual([2, 2]);
  });
}

test('failed save-and-switch retains draft; cancel during validation and switching back rejects late save', async ({
  page,
}) => {
  await page.goto('/');
  const selector = page.getByLabel('Saved agent', { exact: true });
  await revealAgentFields(page);
  await expect(page.getByLabel('Client guidelines')).toBeVisible();
  await revealAgentFields(page);
  await page.getByLabel('Client guidelines').fill('Late candidate');
  await page.route('**/api/runtime/validate', route =>
    route.fulfill({ status: 422, json: { valid: false, error: 'Candidate rejected' } }),
  );
  await selector.click();
  await page.getByRole('option', { name: 'Mocked existing deployed agent', exact: true }).click();
  await page.getByRole('button', { name: 'Save and switch', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Candidate rejected');
  await expect(selector).toContainText('New / generated agent');
  await expect(page.getByLabel('Client guidelines')).toHaveValue('Late candidate');
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await page.unroute('**/api/runtime/validate');
  let release = () => {};
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let requested = () => {};
  const request = new Promise<void>(resolve => {
    requested = resolve;
  });
  await page.route('**/api/runtime/validate', async route => {
    requested();
    await gate;
    await route.fulfill({ json: { valid: true } });
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await request;
  await selector.click();
  await page.getByRole('option', { name: 'Mocked existing deployed agent', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel edits and switch', exact: true }).click();
  await selector.click();
  await page.getByRole('option', { name: 'New / generated agent', exact: true }).click();
  release();
  await revealAgentFields(page);
  await expect(page.getByLabel('Client guidelines')).toHaveValue('');
  await page.reload();
  await revealAgentFields(page);
  await expect(page.getByLabel('Client guidelines')).toHaveValue('');
});

test('malformed storage remains intact and retry can recover after external repair', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{broken'), STORAGE_KEY);
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('preserved');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('{broken');
  await page.evaluate(key => localStorage.removeItem(key), STORAGE_KEY);
  await page.getByRole('button', { name: 'Retry storage' }).click();
  await expect(page.getByLabel('Saved agent', { exact: true })).toBeVisible();
});

test('agent geometry is isolated and retained through switches without revision changes', async ({
  page,
}) => {
  await page.goto('/');
  const selector = page.getByLabel('Saved agent', { exact: true });
  const node = page.getByRole('button', { name: 'Inspect start', exact: true });
  await expect(node).toBeVisible();
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + 50, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 120, { steps: 10 });
  await page.mouse.up();
  const position = await node.getAttribute('style');
  await selector.click();
  await page.getByRole('option', { name: 'Mocked existing deployed agent', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect collect_details', exact: true })).toBeVisible();
  await selector.click();
  await page.getByRole('option', { name: 'New / generated agent', exact: true }).click();
  await expect(node).toHaveAttribute('style', position!);
  const doc = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(doc.agents.map((a: { revision: number }) => a.revision)).toEqual([1, 1]);
});

test('failed storage writes retain saved state and allow retry without losing the draft', async ({
  page,
}) => {
  await page.goto('/');
  await revealAgentFields(page);
  await page.getByLabel('Client guidelines').fill('Durable guidelines');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Reflect.set(window, 'restoreStorage', () => {
      Storage.prototype.setItem = original;
    });
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('quota');
  await revealAgentFields(page);
  await expect(page.getByLabel('Client guidelines')).toHaveValue('Durable guidelines');
  const doc = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(doc.agents[0].revision).toBe(1);
  expect(doc.agents[0].guidelines).toBe('');
  await page.evaluate(() => Reflect.get(window, 'restoreStorage')());
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await revealAgentFields(page);
  await expect(page.getByLabel('Client guidelines')).toHaveValue('Durable guidelines');
});
