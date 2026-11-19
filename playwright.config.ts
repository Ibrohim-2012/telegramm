import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const API = 4100;
const WEB = 3100;

/** E2E runs the real production build of both apps in MOCK mode on private ports (never touches your 3000/4000). */
export default defineConfig({
  testDir: './e2e',
  // The screenshot set is generated on demand with `npm run screens`.
  testIgnore: process.env.SCREENS ? [] : ['**/screens.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1, // the mock server holds one global session
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB}`,
    // Uses the Microsoft Edge that ships with Windows, so no browser download is needed.
    ...devices['Desktop Chrome'],
    channel: process.env.PW_CHANNEL ?? 'msedge',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx server/src/index.ts',
      url: `http://localhost:${API}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: String(API), WEB_ORIGIN: `http://localhost:${WEB}`, TG_API_ID: '', TG_API_HASH: '', MOCK_REALTIME_MS: '600000', AUTH_RATE_LIMIT: '1000', MAX_UPLOAD_MB: '1', SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-1234', PREMIUM_FILE: path.join(os.tmpdir(), `mt-e2e-premium-${Date.now()}.json`), PREMIUM_UPLOAD_MB: '3' },
    },
    {
      cwd: 'web', // Tailwind/PostCSS configs are resolved relative to the working directory
      command: `npx next build && npx next start -p ${WEB}`,
      url: `http://localhost:${WEB}`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${API}`, NEXT_PUBLIC_MAX_UPLOAD_MB: '1', NEXT_DIST_DIR: '.next-e2e' },
    },
  ],
});
