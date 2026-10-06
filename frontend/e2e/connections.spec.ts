import { expect, test, type Locator, type Page } from '@playwright/test';

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Expected a visible drag target');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, from: Locator, to: Locator | { x: number; y: number }) {
  const start = await center(from);
  const end = 'boundingBox' in to ? await center(to) : to;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 16 });
  await page.mouse.up();
}

for (const width of [1440, 390]) {
  test(`move cards, connect to their bodies, reroute and cancel at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const card = page.getByRole('button', { name: 'Inspect offer_times', exact: true });
    for (const name of ['greeting', 'collect_details', 'offer_times', 'confirm']) await expect(page.getByRole('button', { name: `Inspect ${name}`, exact: true })).toBeInViewport();
    const start = await center(card);
    const before = await card.getAttribute('style');
    await drag(page, card, { x: start.x + (width < 768 ? 40 : 160), y: start.y - 25 });
    await expect(card).not.toHaveAttribute('style', before!);
    const moved = await card.getAttribute('style');
    const target = page.getByRole('button', { name: 'Inspect confirm', exact: true });
    await drag(page, page.getByRole('button', { name: 'Add step after greeting', exact: true }), target);
    await expect(page.getByRole('button', { name: 'Inspect transition: When this step is complete.', exact: true })).toBeVisible();
    await expect(card).toHaveAttribute('style', moved!);
    await page.screenshot({ path: testInfo.outputPath(`connected-${width}.png`) });
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByLabel('Target node', { exact: true })).toHaveValue('confirm');
    await page.getByLabel('Transition condition', { exact: true }).fill('The caller wants to finish early.');
    await page.getByRole('button', { name: 'Add information', exact: true }).click();
    await page.getByLabel('Information name').fill('Insurance provider');
    await page.getByLabel('Field description').fill('Ask who provides the caller’s insurance.');
    await page.screenshot({ path: testInfo.outputPath(`collect-information-${width}.png`) });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Changes saved');
    if (width < 768) await page.getByRole('button', { name: 'Graph', exact: true }).click();
    const endpoint = page.locator('.react-flow__edge[data-id*="go_to_confirm"] .react-flow__edgeupdater-target');
    const otherEndpoint = page.locator('.react-flow__edge[data-id*="select_time"] .react-flow__edgeupdater-target');
    const own = await center(endpoint);
    const other = await center(otherEndpoint);
    expect(Math.abs(own.x - other.x)).toBeGreaterThan(20);
    await drag(page, endpoint, card);
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByLabel('Target node', { exact: true })).toHaveValue('offer_times');
    await expect(page.getByLabel('Transition condition', { exact: true })).toHaveValue('The caller wants to finish early.');
    await page.getByRole('button', { name: /Insurance provider Text/ }).click();
    await expect(page.getByLabel('Field description')).toHaveValue('Ask who provides the caller’s insurance.');
    await expect(page.getByLabel('Required', { exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Connections', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Transition 2', exact: true }).getByLabel('Target node', { exact: true })).toHaveValue('confirm');
    if (width < 768) await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await expect(card).toHaveAttribute('style', moved!);
    await page.getByRole('button', { name: 'Inspect transition: The caller wants to finish early.', exact: true }).click();
    const sourceEndpoint = page.locator('.react-flow__edge[data-id*="go_to_confirm"] .react-flow__edgeupdater-source');
    await drag(page, sourceEndpoint, page.getByRole('button', { name: 'Inspect collect_details', exact: true }));
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByLabel('Function name')).toHaveValue('go_to_confirm');
    await expect(page.getByLabel('Transition condition', { exact: true })).toHaveValue('The caller wants to finish early.');
    await expect(page.getByRole('button', { name: 'Insurance provider Text Required', exact: true })).toBeVisible();
    await expect(page.getByLabel('Target node', { exact: true })).toHaveValue('confirm');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Changes saved');
    if (width < 768) await page.getByRole('button', { name: 'Graph', exact: true }).click();
    await expect(page.locator('.react-flow__edge[data-id*="select_time"]')).toHaveCount(1);
    await drag(page, endpoint, { x: 40, y: 500 });
    await expect(page.getByRole('form', { name: 'Add step', exact: true })).toHaveCount(0);
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  });

  test(`drop in empty canvas creates a connected step at the drop position at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Add step after greeting', exact: true });
    await drag(page, trigger, { x: width < 768 ? 55 : 730, y: 450 });
    await expect(page.getByLabel('Step name')).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`drop-create-${width}.png`) });
    await page.getByLabel('Step name').press('Escape');
    await expect(page.getByRole('form', { name: 'Add step', exact: true })).toHaveCount(0);
    await drag(page, trigger, { x: width < 768 ? 55 : 730, y: 450 });
    await page.getByLabel('Step name').fill('Quick goodbye');
    await page.getByLabel('Step type').selectOption('end');
    await page.getByLabel('New transition condition').fill('The caller wants to end the call.');
    await page.getByRole('form', { name: 'Add step', exact: true }).getByRole('button', { name: 'Add step', exact: true }).click();
    const created = page.getByRole('button', { name: 'Inspect Quick_goodbye', exact: true });
    await expect(created).toBeVisible();
    const box = await created.boundingBox();
    expect(box!.x).toBeCloseTo(width < 768 ? 55 : 730, 0);
    expect(box!.y).toBeCloseTo(450, 0);
    if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Changes saved');
  });
}


test('connect and reconnect directly on handles without React Flow selector errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const card = (id: string) => page.getByRole('button', { name: `Inspect ${id}`, exact: true });
  await drag(page, page.getByRole('button', { name: 'Add step after greeting', exact: true }), card('offer_times').locator('.react-flow__handle.target'));
  await expect(page.getByLabel('Target node', { exact: true })).toHaveValue('offer_times');
  const edge = page.locator('.react-flow__edge[data-id*="go_to_offer_times"]');
  await drag(page, edge.locator('.react-flow__edgeupdater-target'), card('confirm').locator('.react-flow__handle.target'));
  await expect(page.getByLabel('Target node', { exact: true })).toHaveValue('confirm');
  await drag(page, edge.locator('.react-flow__edgeupdater-source'), card('collect_details').locator('.react-flow__handle.source').first());
  await expect(edge).toHaveAttribute('aria-label', 'Edge from collect_details to confirm');
  await expect(page.locator('.react-flow__edge[data-id*="select_time"]')).toHaveAttribute('aria-label', 'Edge from offer_times to confirm');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Changes saved');
  expect(errors).toEqual([]);
});
