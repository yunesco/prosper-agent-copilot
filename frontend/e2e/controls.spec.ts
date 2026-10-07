import { expect, test } from '@playwright/test';
import { openDetails, revealAgentFields, seedOriginal } from './seed';

test('dropdown Escape preserves drafts; keyboard selection updates the routing draft', async ({ page }) => {
  await seedOriginal(page);
  await page.goto('/');
  await page
    .getByRole('button', {
      name: "Inspect transition: Record the caller's name and reason once both are known.",
      exact: true,
    })
    .click();
  await openDetails(page);
  const condition = page.getByLabel('Transition condition', { exact: true });
  await condition.fill('Keep this unsaved condition');
  const target = page.getByRole('combobox', { name: 'Target node' });
  await target.focus();
  await target.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(target).toBeFocused();
  await expect(condition).toHaveValue('Keep this unsaved condition');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await target.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(target).toHaveText('Confirm');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await expect(condition).toHaveValue("Record the caller's name and reason once both are known.");
  await expect(target).toHaveText('Offer times');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

for (const width of [1440, 390]) {
  test(`agent menu and switch dialog keep focus and draft at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await openDetails(page);
    await revealAgentFields(page);
    const guidelines = page.getByLabel('Client guidelines');
    await guidelines.fill('Keep my work');
    const selector = page.getByLabel('Saved agent', { exact: true });
    await selector.click();
    const option = page
      .getByRole('group', { name: 'Agents' })
      .getByRole('button', { name: /^Riverside Clinic Scheduler/ });
    await expect(option).toBeVisible();
    await page.screenshot({ path: info.outputPath(`dropdown-${width}.png`) });
    await option.click();
    const dialog = page.getByRole('dialog', { name: 'Unsaved agent changes' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Save and switch' })).toBeFocused();
    await page.screenshot({ path: info.outputPath(`dialog-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(selector).toBeFocused();
    await expect(guidelines).toHaveValue('Keep my work');
    await expect(selector).toHaveText('Untitled agent');
  });
}
