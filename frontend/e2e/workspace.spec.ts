import { seedOriginal } from './seed';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await seedOriginal(page);
});

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`shell and Copilot pane at ${width}x${height}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('main > header').getByRole('navigation', { name: 'Agent mode' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Test Call' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Builder', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('textbox', { name: 'Agent name', includeHidden: true })).toHaveValue(
      'Prosper Scheduler',
    );
    await noOverflow(page);
    const shell = testInfo.outputPath(`shell-${width}.png`);
    await page.screenshot({ path: shell, fullPage: true });
    await testInfo.attach(`shell-${width}`, { path: shell, contentType: 'image/png' });
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
    await expect(page.getByLabel('Message Copilot')).toBeVisible();
    await noOverflow(page);
    const copilot = testInfo.outputPath(`copilot-${width}.png`);
    await page.screenshot({ path: copilot, fullPage: true });
    await testInfo.attach(`copilot-${width}`, { path: copilot, contentType: 'image/png' });
    expect(errors).toEqual([]);
  });
}

test('mobile panes retain drafts and focus; resizing across breakpoint retains context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
  const draft = page.getByLabel('Message Copilot');
  await draft.fill('Mobile draft');
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(draft).toHaveValue('Mobile draft');
  await expect(draft).toBeFocused();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(draft).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(draft).toBeFocused();
  await noOverflow(page);
});
