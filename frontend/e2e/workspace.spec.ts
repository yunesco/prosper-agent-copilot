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

test('pane keyboard, pointer cancellation, bounds, reset and focus retention', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
  const draft = page.getByLabel('Message Copilot');
  await draft.fill('Keep this draft');
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await expect(draft).toBeHidden();
  await page.getByRole('button', { name: 'Open details', exact: true }).click();
  await expect(draft).toHaveValue('Keep this draft');
  await expect(draft).toBeFocused();
  await expect(page.getByRole('button', { name: /Expand workspace|Expand details/ })).toHaveCount(0);
  const divider = page.getByRole('separator', { name: 'Resize panes' });
  await divider.focus();
  await divider.press('Home');
  await expect(divider).toHaveAttribute('aria-valuenow', '40');
  await divider.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '42');
  await divider.press('Shift+ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '52');
  await divider.press('End');
  await expect(divider).toHaveAttribute('aria-valuenow', '75');
  await divider.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '75');
  await divider.dblclick();
  await expect(divider).toHaveAttribute('aria-valuenow', '70');
  const box = await divider.boundingBox();
  if (!box) throw new Error('Missing divider');
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(700, box.y + 100);
  await expect(divider).not.toHaveAttribute('aria-valuenow', '70');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(divider).toHaveAttribute('aria-valuenow', '70');
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(650, box.y + 100);
  await divider.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect(divider).toHaveAttribute('aria-valuenow', '70');
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(700, box.y + 100);
  await page.mouse.up();
  await expect(divider).toHaveAttribute('aria-valuenow', '49');
  await divider.focus();
  expect(
    await divider.evaluate(element => getComputedStyle(element.firstElementChild!).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');
});

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
