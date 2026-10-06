import type { Page } from '@playwright/test';
import { loadAgentFixture } from '../lib/fixtures';
import { STORAGE_KEY } from '../lib/agent/repository';

// Legacy graph tests explicitly exercise the supplied original scheduler.
export async function seedOriginal(page: Page) {
  await page.addInitScript(({ key, agentJson }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({
      version: 1, selectedId: 'original-scheduler',
      agents: [{ id: 'original-scheduler', revision: 1, agent: JSON.parse(agentJson), guidelines: '' }],
    }));
  }, { key: STORAGE_KEY, agentJson: JSON.stringify(loadAgentFixture('original-scheduler')) });
}
