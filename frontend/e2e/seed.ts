import type { Page } from '@playwright/test';
import { loadAgentFixture } from '../lib/fixtures';
import { STORAGE_KEY } from '../lib/agent/repository';

// Legacy graph tests explicitly exercise the supplied original scheduler.
export async function seedOriginal(page: Page) {
  await page.addInitScript(
    ({ key, agentJson }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            selectedId: 'original-scheduler',
            agents: [{ id: 'original-scheduler', revision: 1, agent: JSON.parse(agentJson), guidelines: '' }],
          }),
        );
    },
    { key: STORAGE_KEY, agentJson: JSON.stringify(loadAgentFixture('original-scheduler')) },
  );
}

export async function revealAgentFields(page: Page) {
  await openDetails(page);
  const edit = page.getByRole('button', { name: 'Edit guidelines', exact: true });
  await edit.waitFor();
  if (!(await page.getByLabel('Client guidelines', { exact: true }).isVisible())) await edit.click();
  const disclosure = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Additional details' }) });
  if ((await disclosure.count()) && !(await disclosure.getAttribute('open'))) {
    if (!(await page.getByLabel('Agent instructions', { exact: true }).isVisible()))
      await disclosure.locator('summary').click();
  }
}

// Copilot is the default context tab; specs that edit or inspect the saved agent start from Details.
export async function openDetails(page: Page) {
  const tab = page.getByRole('tab', { name: 'Details', exact: true });
  if (!(await tab.count())) {
    const switcher = page.getByRole('button', { name: 'Details', exact: true });
    if (await switcher.count()) await switcher.click();
  }
  if ((await tab.count()) && (await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}

export async function openCalls(page: Page) {
  const tab = page.getByRole('tab', { name: 'Calls', exact: true });
  if (!(await tab.count())) {
    const switcher = page.getByRole('button', { name: 'Details', exact: true });
    if (await switcher.count()) await switcher.click();
  }
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}
