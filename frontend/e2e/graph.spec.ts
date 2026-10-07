import { seedOriginal, openDetails } from './seed';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await seedOriginal(page);
});

for (const width of [1440, 390]) {
  test(`inspect graph and retain selection/viewport at ${width}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const transition = page.getByRole('button', {
      name: "Inspect transition: Record the caller's name and reason once both are known.",
      exact: true,
    });
    await transition.click();
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await openDetails(page);
    await expect(page.getByRole('heading', { name: 'Transition', exact: true })).toBeVisible();
    await page.getByText('Function details', { exact: true }).click();
    await expect(page.getByLabel('Function name', { exact: true })).toHaveValue('record_details');
    await page.screenshot({ path: testInfo.outputPath(`transition-${width}.png`) });
    if (width < 768) await page.getByRole('button', { name: 'Graph', exact: true }).click();
    else await page.getByRole('button', { name: 'Close details', exact: true }).click();
    const node = page.getByRole('button', { name: 'Inspect collect_details', exact: true });
    await expect(node).toBeVisible();
    await node.focus();
    await node.press('Enter');
    await expect(node).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const viewport = page.locator('.react-flow__viewport');
    const transform = await viewport.getAttribute('style');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await openDetails(page);
    await expect(page.getByRole('textbox', { name: 'Message 1 instructions' })).toHaveValue(
      /Collect the caller's full name/,
    );
    await page.getByRole('button', { name: 'Connections', exact: true }).click();
    await page.getByText('Function details', { exact: true }).click();
    await expect(page.getByLabel('Function name', { exact: true })).toHaveValue('record_details');
    await page.getByRole('button', { name: '→ offer_times' }).click();
    await expect(page.getByRole('heading', { name: 'Offer times', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Connections', exact: true }).click();
    await page.getByRole('button', { name: '→ confirm' }).click();
    await expect(page.getByRole('heading', { name: 'Confirm', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Connections', exact: true }).click();
    await expect(page.getByText('The call ends here.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'General', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`inspector-${width}.png`) });
    if (width < 768) await page.getByRole('button', { name: 'Graph', exact: true }).click();
    else {
      await page.getByRole('button', { name: 'Close details', exact: true }).click();
      await page.getByRole('button', { name: 'Open details', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: 'Inspect confirm', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(viewport).toHaveAttribute('style', transform!);
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`graph-${width}.png`) });
    await page.getByRole('button', { name: 'Inspect confirm', exact: true }).press('Escape');
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await openDetails(page);
    await expect(page.getByRole('textbox', { name: 'Agent name', exact: true })).toHaveValue(
      'Prosper Scheduler',
    );
    expect(errors).toEqual([]);
  });
}
