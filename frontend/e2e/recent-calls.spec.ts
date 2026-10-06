import { expect, test } from '@playwright/test';

for (const width of [1440, 390])
  test(`historical call review remains readable at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByLabel('Saved agent', { exact: true }).click();
    await page.getByRole('option', { name: 'Mocked existing deployed agent' }).click();
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    const calls = page.getByRole('region', { name: 'Recent calls', exact: true });
    await calls.scrollIntoViewIfNeeded();
    await expect(calls.getByRole('button', { name: /turns/ })).toHaveCount(5);
    await expect(calls.getByRole('button', { name: 'Review recent calls with Copilot' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`calls-${width}.png`) });
    await calls.getByRole('button', { name: /Reported Friday booking issue/ }).click();
    const details = page.getByRole('region', { name: 'Call details', exact: true });
    await expect(details.getByRole('button', { name: 'Back to agent details' })).toBeInViewport();
    await expect(details.getByRole('button', { name: 'Back to agent details' })).toBeFocused();
    await expect(details.getByText('Outcome: Failed', { exact: true })).toBeVisible();
    await expect(details.getByRole('blockquote')).toContainText('A new patient was offered Friday');
    await details.getByRole('button', { name: 'offer_times', exact: true }).click();
    await expect(details.getByRole('list', { name: 'Transcript turns' }).getByRole('listitem')).toHaveCount(
      5,
    );
    await expect(details.getByRole('heading', { name: 'Transcript', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`transcript-${width}.png`) });
    expect(await details.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await details.getByRole('button', { name: 'Back to agent details' }).click();
    await calls.getByRole('button', { name: /^Monday booking/ }).click();
    await expect(details.getByText('Outcome: Successful', { exact: true })).toBeVisible();
    await expect(details.getByText('Client feedback: None reported.')).toBeVisible();
  });
