import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';

export const API = 'http://localhost:4100';
/** Must match SESSION_SECRET of the E2E server in playwright.config.ts (used to mint premium codes). */
export const E2E_SECRET = 'e2e-secret-e2e-secret-e2e-secret-1234';

type Fixtures = {
  /** Call to whitelist expected console errors (e.g. the 400 from a deliberately wrong code). */
  allowConsole: (re: RegExp) => void;
  /** Mock session reset + login through the API, then open the app. */
  loggedIn: Page;
};

export const test = base.extend<Fixtures>({
  // Every test fails on unexpected browser console errors / uncaught exceptions.
  allowConsole: [
    async ({ page }, use) => {
      const seen: string[] = [];
      const allowed: RegExp[] = [];
      page.on('console', (m) => m.type() === 'error' && seen.push(m.text()));
      page.on('response', (r) => r.status() >= 400 && seen.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`));
      page.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`));
      await use((re) => void allowed.push(re));
      const unexpected = seen.filter((s) => !allowed.some((re) => re.test(s)));
      expect(unexpected, 'browser console errors').toEqual([]);
    },
    { auto: true },
  ],
  loggedIn: async ({ page, request }, use) => {
    await apiLogin(request);
    await page.goto('/');
    await expect(page.getByRole('searchbox')).toBeVisible();
    await use(page);
  },
});

export async function apiLogin(request: APIRequestContext) {
  await request.post(`${API}/api/auth/logout`);
  const p = await request.post(`${API}/api/auth/phone`, { data: { phone: '+998901234567' } });
  expect(p.ok()).toBeTruthy();
  const c = await request.post(`${API}/api/auth/code`, { data: { code: '12345' } });
  expect((await c.json()).state).toBe('ready');
}

export async function apiLogout(request: APIRequestContext) {
  await request.post(`${API}/api/auth/logout`);
}

export const uniq = (s: string) => `${s} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

/** The message bubble element (the focusable inner div) containing the text. */
export const bubble = (page: Page, text: string | RegExp) => page.getByTestId('msg').filter({ hasText: text }).last().locator('div[tabindex="0"]');

export const openChat = async (page: Page, name: string) => {
  await page.getByRole('list', { name: 'Chats' }).getByRole('button', { name: new RegExp(name) }).first().click();
  await expect(page.getByRole('log')).toBeVisible();
  await expect(page.getByTestId('msg').first()).toBeVisible();
};

/** Clicks an entry of the hamburger drawer (the drawer must be open). */
export const menu = async (page: Page, item: string) => {
  await page.getByRole('dialog', { name: 'Menyu' }).getByRole('button', { name: item }).click();
};

export { expect };
