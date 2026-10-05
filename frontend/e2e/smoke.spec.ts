import { expect, test } from '@playwright/test';

test('serves the built shell and health route without external services', async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page).toHaveTitle('Prosper Agent Builder');
  await expect(page.getByRole('heading', { level: 1, name: 'Prosper Agent Builder' })).toBeVisible();
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({ status: 'ok', service: 'frontend' });
  expect(errors).toEqual([]);
  const screenshot = testInfo.outputPath('application-shell.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('application-shell', { path: screenshot, contentType: 'image/png' });
});
