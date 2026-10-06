import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`choice editing survives selection and pane changes at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Inspect transition: Record the slot the caller picks.', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    const row = page.getByRole('button', { name: 'Slot Choice Required', exact: true });
    await expect(row).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`slot-summary-${width}.png`) });
    await row.click();
    await page.getByLabel('Option 1', { exact: true }).fill('Monday 9 AM');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    if (width < 768) await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await page.getByRole('button', { name: 'Inspect greeting', exact: true }).click();
    await page.getByRole('button', { name: 'Inspect transition: Record the slot the caller picks.', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByLabel('Option 1', { exact: true })).toHaveValue('Monday 9 AM');
    await page.screenshot({ path: testInfo.outputPath(`slot-editor-${width}.png`) });
    await page.getByRole('button', { name: 'Cancel field', exact: true }).click();
    await row.click();
    await expect(page.getByLabel('Option 1', { exact: true })).toHaveValue('Tuesday 10 AM');
    await page.getByLabel('Field key').fill('appointment_slot');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Changes saved');
    await expect(page.getByRole('button', { name: 'Appointment slot Choice Required', exact: true })).toBeVisible();
  });
}
