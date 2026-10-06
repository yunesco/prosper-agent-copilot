import { seedOriginal } from './seed';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await seedOriginal(page);
});

for (const width of [1440, 390]) {
  test(`inline edits, draft retention and validated saves at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Inspect collect_details', exact: true }).click();
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    const goal = page.getByRole('textbox', { name: 'Message 1 instructions' });
    await expect(page.getByRole('button', { name: 'Edit instructions' })).toHaveCount(0);
    await expect(page.getByText('Advanced details')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await goal.fill('Collect name and date of birth before continuing.');
    await page.screenshot({ path: testInfo.outputPath(`edit-${width}.png`) });
    await page.getByRole('button', { name: 'Connections', exact: true }).click();
    await page.getByRole('button', { name: '→ offer_times' }).click();
    await page.getByRole('button', { name: 'Agent overview', exact: true }).click();
    await page.getByText('Additional details', { exact: true }).click();
    await page.getByRole('button', { name: /^Collect details/ }).click();
    await page.getByRole('button', { name: 'General', exact: true }).click();
    await expect(goal).toHaveValue('Collect name and date of birth before continuing.');
    await goal.press('Control+Enter');
    await expect(page.getByRole('status')).toHaveText('Changes saved');
    await expect(
      page.getByRole('button', { name: 'Inspect collect_details', exact: true, includeHidden: true }),
    ).toContainText('Collect name and date of birth');
    await page.getByRole('button', { name: 'Connections', exact: true }).click();
    await page.getByRole('combobox', { name: 'Target node', exact: true }).click();
    await page.getByRole('option', { name: 'Confirm', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Transition condition', exact: true })
      .fill('Continue once details are complete.');
    await page.screenshot({ path: testInfo.outputPath(`transition-edit-${width}.png`) });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Node settings' }).getByRole('alert')).toContainText(
      "'offer_times' is unreachable",
    );
    await page.getByRole('combobox', { name: 'Target node', exact: true }).click();
    await page.getByRole('option', { name: 'Offer times', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Changes saved');
    await page.getByRole('button', { name: '→ offer_times' }).click();
    await page.getByRole('button', { name: 'Agent overview', exact: true }).click();
    await page.getByText('Additional details', { exact: true }).click();
    await page.getByRole('button', { name: /^Collect details/ }).click();
    await expect(page.getByRole('textbox', { name: 'Transition condition', exact: true })).toHaveValue(
      'Continue once details are complete.',
    );
    await expect(page.getByRole('combobox', { name: 'Target node', exact: true })).toContainText(
      'Offer times',
    );
    await page.getByRole('button', { name: 'General', exact: true }).click();
    await goal.fill('Do not commit an invalid edit');
    await page.route('**/api/runtime/validate', route =>
      route.fulfill({
        status: 422,
        json: { valid: false, error: 'Invalid candidate. Check the transition target.' },
      }),
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Node settings' }).getByRole('alert')).toHaveText(
      'Invalid candidate. Check the transition target.',
    );
    await expect(goal).toHaveValue('Do not commit an invalid edit');
    await expect(
      page.getByRole('button', { name: 'Inspect collect_details', exact: true, includeHidden: true }),
    ).toContainText('Do not commit an invalid edit');
    await page.screenshot({ path: testInfo.outputPath(`edit-error-${width}.png`) });
    await page.unroute('**/api/runtime/validate');
    await page.route('**/api/runtime/validate', route => route.abort('connectionfailed'));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Node settings' }).getByRole('alert')).toContainText(
      'Validation service unavailable',
    );
    await goal.press('Escape');
    await expect(goal).toHaveValue('Collect name and date of birth before continuing.');
    await expect(goal).toBeFocused();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Collect details', exact: true })).toBeVisible();
  });
}
