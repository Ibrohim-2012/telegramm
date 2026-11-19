import { expect, openChat, test } from './fixtures';

test.describe('info panel and attach menu', () => {
  test('profile panel has Media / Fayllar / Havolalar tabs with real content', async ({ loggedIn: page }) => {
    await openChat(page, 'Aziza Karimova');
    await page.getByRole('button', { name: /^Chat ma.lumoti$/ }).first().click();
    const panel = page.getByRole('complementary', { name: 'Ma’lumot' });
    await expect(panel).toBeVisible();
    const tabs = panel.getByRole('tablist');
    await expect(tabs.getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByTestId('shared').locator('img').first()).toBeVisible(); // photo grid

    await tabs.getByRole('tab', { name: 'Fayllar' }).click();
    await expect(panel.getByRole('link', { name: /hisobot-85\.txt/ })).toBeVisible();

    await tabs.getByRole('tab', { name: 'Havolalar' }).click();
    await expect(panel.getByRole('link', { name: 'https://example.com/reja' }).first()).toHaveAttribute('target', '_blank');

    await tabs.getByRole('tab', { name: 'Media' }).click();
    await panel.getByTestId('shared').getByRole('button').first().click(); // opens the photo viewer
    await expect(page.getByRole('dialog').last()).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('attach button opens a menu: photo/video or file', async ({ loggedIn: page }) => {
    await openChat(page, 'Aziza Karimova');
    await page.getByRole('button', { name: 'Fayl biriktirish' }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Rasm yoki video' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Fayl', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    await page.getByRole('button', { name: 'Fayl biriktirish' }).click();
    await page.getByTestId('media-input').setInputFiles({ name: 'rasm.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    await expect(page.getByRole('dialog', { name: 'Fayl yuborish' })).toBeVisible(); // same preview dialog as before
  });
});
