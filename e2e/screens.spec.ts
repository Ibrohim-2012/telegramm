import fs from 'node:fs';
import path from 'node:path';
import { apiLogin, apiLogout, expect, openChat, test } from './fixtures';

/** `npm run screens` — writes the reference screenshot set to docs/screens (desktop 1440x900, mobile 390x844, light + dark). */
const OUT = path.resolve(__dirname, '../docs/screens');
const VIEWS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;

for (const [view, size] of Object.entries(VIEWS)) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${view} ${theme}`, () => {
      test.use({ viewport: size, hasTouch: view === 'mobile', isMobile: view === 'mobile', deviceScaleFactor: 1 });

      test.beforeEach(async ({ page }) => {
        fs.mkdirSync(OUT, { recursive: true });
        await page.addInitScript((t) => {
          localStorage.setItem('mt-ui', JSON.stringify({ state: { theme: t, lang: 'uz', fontSize: 16, wallpaper: 'classic', notify: false, sound: true, notifyPreview: true }, version: 0 }));
        }, theme);
      });

      const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: path.join(OUT, `${view}-${theme}-${name}.png`) });

      test('login', async ({ page, request }) => {
        await apiLogout(request);
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Telegramga kirish' })).toBeVisible();
        await page.waitForTimeout(400);
        await shot(page, '1-login');
      });

      test('list and chat', async ({ page, request }) => {
        await apiLogin(request);
        await page.goto('/');
        await expect(page.getByRole('searchbox')).toBeVisible();
        await expect(page.getByRole('list', { name: 'Chats' }).getByRole('button').first()).toBeVisible();
        await page.waitForTimeout(600);
        await shot(page, '2-list');
        await openChat(page, 'Aziza Karimova');
        await page.waitForTimeout(700);
        await shot(page, '3-chat');
      });

      test('media, selection and menus', async ({ page, request }) => {
        await apiLogin(request);
        await page.goto('/');
        await expect(page.getByRole('searchbox')).toBeVisible();
        await openChat(page, 'Jasur Aliyev');
        await page.getByTestId('voice').last().scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await shot(page, '5-media');
        const target = page.getByTestId('msg').last().locator('div[tabindex="0"]');
        await target.click({ button: 'right' });
        await page.waitForTimeout(400);
        await shot(page, '6-context-menu');
        await page.getByRole('menuitem', { name: 'Tanlash' }).click();
        await page.getByTestId('msg').nth(-3).click();
        await page.waitForTimeout(400);
        await shot(page, '7-selection');
      });

      test('drawer', async ({ page, request }) => {
        await apiLogin(request);
        await page.goto('/');
        await expect(page.getByRole('searchbox')).toBeVisible();
        await page.getByRole('button', { name: 'Menyu' }).click();
        await expect(page.getByRole('dialog', { name: 'Menyu' })).toContainText('Sinov Foydalanuvchi');
        await page.waitForTimeout(600);
        await shot(page, '4-drawer');
      });
    });
  }
}
