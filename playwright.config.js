import { defineConfig } from '@playwright/test';

const port = Number(process.env.VIM_NAV_TEST_PORT || 4279);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('VIM_NAV_TEST_PORT must be an integer between 1 and 65535');
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './test',
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL, reducedMotion: 'reduce', trace: 'retain-on-failure' },
  projects: ['chromium', 'firefox', 'webkit'].map(browserName => ({
    name: browserName,
    use: { browserName },
  })),
  webServer: {
    command: `node test/serve.js ${port}`,
    url: `${baseURL}/test/fixture.html`,
  },
});
