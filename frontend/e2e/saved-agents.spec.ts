import { revealAgentFields } from './seed';
import { expect, test } from '@playwright/test';
import { STORAGE_KEY } from '../lib/agent/repository';

for (const width of [1440, 390]) {
  test(`saved agents, combined drafts, switch decisions and reload at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const selector = page.getByLabel('Saved agent', { exact: true });
    await expect(selector).toContainText('Untitled agent');
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
    await page
      .getByRole('group', { name: 'Agents' })
      .getByRole('button', { name: /^Riverside Family Clinic/ })
      .click();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(selector).toContainText('Untitled agent');
    await revealAgentFields(page);
    await expect(page.getByLabel('Client guidelines')).toHaveValue('Discard this');
    await selector.click();
    await page
      .getByRole('group', { name: 'Agents' })
      .getByRole('button', { name: /^Riverside Family Clinic/ })
      .click();
    await page.getByRole('button', { name: 'Cancel edits and switch', exact: true }).click();
    await expect(selector).toContainText('Riverside Family Clinic');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await revealAgentFields(page);
    await page.getByLabel('Client guidelines').fill('Clinic saved guidelines');
    await selector.click();
    await page
      .getByRole('group', { name: 'Agents' })
      .getByRole('button', { name: /^Untitled agent/ })
      .click();
    await page.getByRole('button', { name: 'Save and switch', exact: true }).click();
    await expect(selector).toContainText('Untitled agent');
    await page.reload();
    await expect(selector).toContainText('Untitled agent');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await revealAgentFields(page);
    await expect(page.getByLabel('Client guidelines')).toHaveValue('New agent saved guidelines');
    await revealAgentFields(page);
    await expect(page.getByLabel('Agent instructions', { exact: true })).toHaveValue(
      'Saved new instructions',
    );
    await selector.click();
    await page
      .getByRole('group', { name: 'Agents' })
      .getByRole('button', { name: /^Riverside Family Clinic/ })
      .click();
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await revealAgentFields(page);
    await expect(page.getByLabel('Client guidelines')).toHaveValue('Clinic saved guidelines');
    await page.reload();
    await expect(selector).toContainText('Riverside Family Clinic');
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
  await page
    .getByRole('group', { name: 'Agents' })
    .getByRole('button', { name: /^Riverside Family Clinic/ })
    .click();
  await page.getByRole('button', { name: 'Save and switch', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Candidate rejected');
  await expect(selector).toContainText('Untitled agent');
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
  await page
    .getByRole('group', { name: 'Agents' })
    .getByRole('button', { name: /^Riverside Family Clinic/ })
    .click();
  await page.getByRole('button', { name: 'Cancel edits and switch', exact: true }).click();
  await selector.click();
  await page
    .getByRole('group', { name: 'Agents' })
    .getByRole('button', { name: /^Untitled agent/ })
    .click();
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
  await page
    .getByRole('group', { name: 'Agents' })
    .getByRole('button', { name: /^Riverside Family Clinic/ })
    .click();
  await expect(page.getByRole('button', { name: 'Inspect collect_identity', exact: true })).toBeVisible();
  await selector.click();
  await page
    .getByRole('group', { name: 'Agents' })
    .getByRole('button', { name: /^Untitled agent/ })
    .click();
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

test('Add agent names the agent inline, validates the name, and respects unsaved drafts', async ({
  page,
}) => {
  await page.goto('/');
  const selector = page.getByLabel('Saved agent', { exact: true });
  await expect(selector).toBeVisible();
  const count = () =>
    page.evaluate(key => JSON.parse(localStorage.getItem(key)!).agents.length as number, STORAGE_KEY);
  expect(await count()).toBe(2);

  const addAgent = async (name: string) => {
    await selector.click();
    await page.getByRole('button', { name: 'Add agent', exact: true }).click();
    await page.getByLabel('New agent name').fill(name);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
  };
  await addAgent('Harbor Dental');
  await expect(selector).toContainText('Harbor Dental');
  expect(await count()).toBe(3);

  // The list shows every agent by name, with Add agent always at the end.
  await selector.click();
  const list = page.getByRole('group', { name: 'Agents' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list.getByRole('button', { name: /^Harbor Dental/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: 'Add agent', exact: true })).toBeVisible();

  // Names are required and unique.
  await page.getByRole('button', { name: 'Add agent', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Enter a name for the agent.')).toBeVisible();
  await page.getByLabel('New agent name').fill('harbor dental');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('An agent with this name already exists.')).toBeVisible();
  await page.getByLabel('New agent name').press('Escape');
  await expect(page.getByLabel('New agent name')).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(await count()).toBe(3);

  // An unsaved draft is guarded before the new agent is created.
  await revealAgentFields(page);
  await page.getByLabel('Client guidelines').fill('Unsaved draft');
  await addAgent('Second Clinic');
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  expect(await count()).toBe(3);
  await addAgent('Second Clinic');
  await page.getByRole('button', { name: 'Cancel edits and switch', exact: true }).click();
  await expect(selector).toContainText('Second Clinic');
  expect(await count()).toBe(4);
  await page.reload();
  await expect(selector).toContainText('Second Clinic');
});

test('agents can be renamed from the switcher, including the deployed one, and persist', async ({ page }) => {
  await page.goto('/');
  const selector = page.getByLabel('Saved agent', { exact: true });
  await expect(selector).toBeVisible();
  await selector.click();
  await page.getByRole('button', { name: 'Rename Untitled agent', exact: true }).click();
  await page.getByLabel('Rename Untitled agent').fill('Riverside Family Clinic');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('An agent with this name already exists.')).toBeVisible();
  await page.getByLabel('Rename Untitled agent').fill('Front desk');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(selector).toContainText('Front desk');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Front desk');

  // The switcher stays open after a rename; a non-open agent is renamed without switching to it.
  await page.getByRole('button', { name: 'Rename Riverside Family Clinic', exact: true }).click();
  await page.getByLabel('Rename Riverside Family Clinic').fill('Riverside (live)');
  await page.getByLabel('Rename Riverside Family Clinic').press('Enter');
  await expect(page.getByRole('button', { name: /^Riverside \(live\)/ })).toBeVisible();
  await expect(selector).toContainText('Front desk');
  await page.keyboard.press('Escape');
  await page.reload();
  await selector.click();
  await expect(page.getByRole('button', { name: /^Riverside \(live\)/ })).toBeVisible();
});

test('Delete agent confirms inline, works on any agent, and the last agent is protected', async ({
  page,
}) => {
  await page.goto('/');
  const selector = page.getByLabel('Saved agent', { exact: true });
  await expect(selector).toBeVisible();
  await selector.click();
  // Cancel keeps it.
  await page.getByRole('button', { name: 'Delete Untitled agent', exact: true }).click();
  await expect(page.getByText('Delete Untitled agent?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Untitled agent/ })).toBeVisible();
  // Deleting a different agent leaves the open one untouched.
  await page.getByRole('button', { name: 'Delete Riverside Family Clinic', exact: true }).click();
  await page.getByRole('button', { name: 'Delete agent', exact: true }).click();
  await expect(selector).toContainText('Untitled agent');
  // The last agent cannot be deleted.
  await selector.click();
  await expect(page.getByRole('button', { name: 'Delete Untitled agent', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(selector).toContainText('Untitled agent');
});
