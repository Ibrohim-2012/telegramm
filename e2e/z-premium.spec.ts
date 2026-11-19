import { API, E2E_SECRET, expect, menu, test } from './fixtures';
import { PremiumStore } from '../server/src/premium';

// Runs last (file name): Premium is stored on the E2E server for the rest of the run and raises the upload limit.
test.describe.configure({ mode: 'serial' });

const openPremium = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Menyu', exact: true }).click();
  await menu(page, 'Premium');
  const dlg = page.getByRole('dialog', { name: 'Mening Telegramim Premium' });
  await expect(dlg).toBeVisible();
  return dlg;
};

test.describe('app Premium (free trial, then codes)', () => {
  test('free months unlock the perks: bigger uploads, emoji status, accent colour, exclusive background', async ({ loggedIn: page, request }) => {
    const big = { name: 'big.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(2 * 1024 * 1024) };
    // Free limit is 1 MB in the E2E server, Premium 3 MB.
    const before = await request.post(`${API}/api/dialogs/1000/upload`, { multipart: { file: big } });
    expect(before.status()).toBe(413);
    expect((await before.json()).error.premiumLimitMb).toBe(3);

    // Locked perks first.
    await page.getByRole('button', { name: 'Menyu', exact: true }).click();
    await menu(page, 'Sozlamalar');
    const settings = page.getByRole('dialog', { name: 'Sozlamalar' });
    await settings.getByRole('button', { name: 'Chat sozlamalari' }).click();
    await settings.getByRole('radio', { name: /Aurora/ }).click(); // locked -> opens the Premium dialog instead
    await expect(page.locator('html')).toHaveAttribute('data-wp', 'classic');
    const dlg = page.getByRole('dialog', { name: 'Mening Telegramim Premium' });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('Telegram Premium emas'); // honest: works in this app only
    await expect(dlg).toContainText('Sinov muddatidan keyin');

    await dlg.getByRole('button', { name: '2 oy bepul boshlash' }).click();
    await expect(dlg.getByTestId('premium-status')).toContainText('Bepul sinov faol');
    await expect(dlg.getByRole('button', { name: '2 oy bepul boshlash' })).toHaveCount(0); // once only

    await dlg.getByRole('button', { name: '🔥' }).click();
    await dlg.getByRole('radio', { name: 'Pushti' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'pink');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Menyu', exact: true }).click();
    await expect(page.getByTestId('drawer-name')).toContainText('🔥');
    await page.keyboard.press('Escape');

    // 2 MB now goes through (limit 3 MB).
    const after = await request.post(`${API}/api/dialogs/1000/upload`, { multipart: { file: big } });
    expect(after.status()).toBe(201);

    // Exclusive background is available and persists with the reload.
    await page.getByRole('button', { name: 'Menyu', exact: true }).click();
    await menu(page, 'Sozlamalar');
    await page.getByRole('dialog', { name: 'Sozlamalar' }).getByRole('button', { name: 'Chat sozlamalari' }).click();
    await page.getByRole('radio', { name: /Aurora/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-wp', 'aurora');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'pink'); // stored on the server
    await expect(page.locator('html')).toHaveAttribute('data-wp', 'aurora');
  });

  test('activation codes: wrong and reused codes are refused, a valid one adds paid months', async ({ loggedIn: page, allowConsole }) => {
    allowConsole(/HTTP 40[09] POST .*\/api\/premium\/redeem|status of 40[09]/); // the deliberate wrong / reused codes
    const dlg = await openPremium(page);
    const input = dlg.getByRole('textbox', { name: 'Faollashtirish kodi' });

    await input.fill('MT-1-AAAAAAAAAA-BBBBBBBBBBBB');
    await dlg.getByRole('button', { name: 'Faollashtirish' }).click();
    await expect(dlg.getByRole('alert')).toContainText('Kod noto‘g‘ri');

    const code = PremiumStore.makeCode(E2E_SECRET, 3);
    await input.fill(code);
    await dlg.getByRole('button', { name: 'Faollashtirish' }).click();
    await expect(dlg.getByTestId('premium-status')).toContainText('Premium faol'); // paid time is past the trial now
    await expect(page.getByText('Premium faollashtirildi')).toBeVisible();

    await input.fill(code);
    await dlg.getByRole('button', { name: 'Faollashtirish' }).click();
    await expect(dlg.getByRole('alert')).toContainText('allaqachon ishlatilgan');
  });
});
