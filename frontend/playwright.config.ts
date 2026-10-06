import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [{
    command: '../backend/.venv/bin/python ../backend/tests/serve_validation.py',
    url: 'http://127.0.0.1:7862/openapi.json',
    reuseExistingServer: false,
    timeout: 60_000,
  }, {
    command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: '1', NEXT_DIST_DIR: '.next-e2e', UI_PREVIEW: '1', AGENT_RUNTIME_URL: 'http://127.0.0.1:7862' },
  }],
});
