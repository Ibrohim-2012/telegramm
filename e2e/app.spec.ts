import { apiLogout, bubble, expect, menu, openChat, test, uniq } from './fixtures';

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.describe('auth', () => {
  test('wrong code, 2FA password, then logout', async ({ page, request, allowConsole }) => {
    allowConsole(/status of 400|HTTP 400/); // the deliberate wrong code / password
    await apiLogout(request);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Telegramga kirish' })).toBeVisible();
    await expect(page.getByText('MOCK rejim: kod 12345')).toBeVisible();
    // Phone ends with 0 => this mock account has a cloud password.
    await page.getByRole('textbox', { name: 'Telefon raqami' }).fill('901234560');
    await page.getByRole('button', { name: 'Davom etish' }).click();

    await expect(page.getByRole('heading', { name: 'Kodni kiriting' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Tasdiqlash kodi' }).fill('00000');
    await page.getByRole('button', { name: 'Davom etish' }).click();
    await expect(page.locator('p[role=alert]')).toHaveText('Kod noto‘g‘ri');

    await page.getByRole('textbox', { name: 'Tasdiqlash kodi' }).fill('12345');
    await page.getByRole('button', { name: 'Davom etish' }).click();
    await expect(page.getByRole('heading', { name: 'Ikki bosqichli parol' })).toBeVisible();

    await page.getByLabel('Parol').fill('xato');
    await page.getByRole('button', { name: 'Davom etish' }).click();
    await expect(page.locator('p[role=alert]')).toHaveText('Parol noto‘g‘ri');

    await page.getByLabel('Parol').fill('mock2fa');
    await page.getByRole('button', { name: 'Davom etish' }).click();
    await expect(page.getByRole('searchbox')).toBeVisible();

    await page.getByRole('button', { name: 'Menyu' }).click();
    // let the drawer finish loading the profile before leaving (otherwise its requests race the logout)
    await expect(page.getByRole('dialog', { name: 'Menyu' })).toContainText('Sinov Foydalanuvchi');
    await page.waitForTimeout(300);
    await menu(page, 'Chiqish');
    await expect(page.getByRole('heading', { name: 'Telegramga kirish' })).toBeVisible();
  });

  test('login without 2FA, and the session survives a page reload', async ({ page, request }) => {
    await apiLogout(request);
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Telefon raqami' }).fill('901234567');
    await page.getByRole('button', { name: 'Davom etish' }).click();
    await page.getByRole('textbox', { name: 'Tasdiqlash kodi' }).fill('12345');
    await page.getByRole('button', { name: 'Davom etish' }).click();
    await expect(page.getByRole('searchbox')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('searchbox')).toBeVisible();
  });
});

test.describe('chats and history', () => {
  test('list, open chat, load older messages without duplicates', async ({ loggedIn: page }) => {
    await expect(page.getByRole('list', { name: 'Chats' }).getByRole('button').first()).toBeVisible();
    await openChat(page, 'Jasur Aliyev');
    const msgs = page.getByTestId('msg');
    await expect.poll(() => msgs.count()).toBeGreaterThanOrEqual(30);
    const first = await msgs.count();

    await page.getByRole('log').hover();
    await expect
      .poll(async () => {
        await page.mouse.wheel(0, -4000);
        return msgs.count();
      })
      .toBeGreaterThan(first);

    const ids = await msgs.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.mid));
    expect(new Set(ids).size).toBe(ids.length);
    const nums = ids.map(Number);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });

  test('folders filter the list', async ({ loggedIn: page }) => {
    const list = page.getByRole('list', { name: 'Chats' });
    await page.getByRole('button', { name: 'Kanallar' }).click();
    await expect(list.getByRole('button', { name: /Kun\.uz yangiliklari/ })).toBeVisible();
    await expect(list.getByRole('button', { name: /Aziza Karimova/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Guruhlar' }).click();
    await expect(list.getByRole('button', { name: /Oila/ })).toBeVisible();
    await page.getByRole('button', { name: 'O‘qilmagan' }).click();
    await expect(list.getByRole('button').first()).toBeVisible();
  });

  test('search: local filter, empty state, global @username', async ({ loggedIn: page }) => {
    const list = page.getByRole('list', { name: 'Chats' });
    const search = page.getByRole('searchbox');
    await search.fill('Bobur');
    await expect(list.getByRole('button', { name: /Bobur Yusupov/ })).toBeVisible();
    await expect(list.getByRole('button', { name: /Aziza Karimova/ })).toHaveCount(0);

    await search.fill('zzzzqq');
    await expect(page.getByText('Chatlar topilmadi')).toBeVisible();

    await search.fill('@barno');
    await expect(page.getByText('Global qidiruv')).toBeVisible();
    await list.getByRole('button', { name: /Barno design/ }).click();
    await expect(page.getByRole('log')).toBeVisible();
    await page.getByRole('button', { name: 'Chat ma’lumoti' }).click();
    await expect(page.getByRole('complementary', { name: 'Ma’lumot' }).getByText('@barno.design')).toBeVisible();
  });

  test('profile panel shows details and closes with Escape', async ({ loggedIn: page }) => {
    await openChat(page, 'Aziza Karimova');
    await page.getByRole('button', { name: 'Chat ma’lumoti' }).click();
    const panel = page.getByRole('complementary', { name: 'Ma’lumot' });
    await expect(panel.getByText('Telefon')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });
});

test.describe('messaging', () => {
  test('send, realtime typing + reply, read receipt', async ({ loggedIn: page }) => {
    await openChat(page, 'Aziza Karimova');
    const text = uniq('E2E salom');
    await page.getByRole('textbox', { name: 'Xabar yozing...' }).fill(text);
    await page.keyboard.press('Enter');

    const mine = page.getByTestId('msg').filter({ hasText: text });
    await expect(mine).toHaveCount(1);
    await expect(mine.getByLabel('read')).toBeVisible({ timeout: 8000 }); // ✓✓ from the simulated peer
    await expect(page.getByRole('main').getByText('yozmoqda...').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('msg').filter({ hasText: 'Xabaringiz uchun rahmat' }).filter({ hasText: text.slice(0, 20) })).toHaveCount(1, { timeout: 10_000 });
    await expect(page.getByTestId('msg').filter({ hasText: text })).toHaveCount(2); // mine + the echo mention, no duplicates
  });

  test('Shift+Enter adds a new line, Enter sends', async ({ loggedIn: page }) => {
    await openChat(page, 'Bobur Yusupov');
    const box = page.getByRole('textbox', { name: 'Xabar yozing...' });
    const a = uniq('qator1');
    await box.fill(a);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('qator2');
    await expect(box).toHaveValue(`${a}\nqator2`);
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('');
    await expect(page.getByTestId('msg').filter({ hasText: 'qator2' }).filter({ hasText: a })).toHaveCount(1);
  });

  test('reply, edit and delete through the context menu', async ({ loggedIn: page }) => {
    await openChat(page, 'Malika Tursunova');
    const box = page.getByRole('textbox', { name: 'Xabar yozing...' });
    const base = uniq('Asl xabar');
    await box.fill(base);
    await page.keyboard.press('Enter');
    await expect(bubble(page, base)).toBeVisible();

    // Reply
    await bubble(page, base).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Javob berish' }).click();
    await expect(page.getByTestId('compose-bar')).toContainText(base);
    const reply = uniq('Javobim');
    await box.fill(reply);
    await page.keyboard.press('Enter');
    const replyMsg = page.getByTestId('msg').filter({ hasText: reply });
    await expect(replyMsg).toHaveCount(1);
    await expect(replyMsg).toContainText(base); // quoted original

    // Edit (the reply also contains the original text as a quote, so take the first match)
    await page.getByTestId('msg').filter({ hasText: base }).first().locator('div[tabindex="0"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Tahrirlash' }).click();
    await expect(box).toHaveValue(base);
    const edited = uniq('Tahrirlangan');
    await box.fill(edited);
    await page.keyboard.press('Enter');
    // the reply quotes the edited text too, so the original is the first match
    const editedMsg = page.getByTestId('msg').filter({ hasText: edited }).first();
    await expect(editedMsg).toContainText('tahrirlangan');
    await expect(editedMsg.getByLabel('read').or(editedMsg.getByLabel('sent'))).toBeVisible();

    // Delete for everyone
    await editedMsg.locator('div[tabindex="0"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'O‘chirish' }).click();
    await page.getByRole('button', { name: 'Hamma uchun' }).click();
    await expect(page.getByTestId('msg').filter({ hasText: edited })).toHaveCount(0);
    // the reply that quoted it stays, now with a placeholder
    await expect(page.getByTestId('msg').filter({ hasText: reply }).filter({ hasNotText: 'Xabaringiz' })).toHaveCount(1); // (the simulated peer may echo it too)
  });

  test('copy, forward to another chat', async ({ loggedIn: page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openChat(page, 'Aziza Karimova');
    const text = uniq('Yo‘naltiriladigan');
    await page.getByRole('textbox', { name: 'Xabar yozing...' }).fill(text);
    await page.keyboard.press('Enter');
    await expect(bubble(page, text)).toBeVisible();

    await bubble(page, text).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Nusxalash' }).click();
    await expect(page.getByRole('status').getByText('Nusxalandi')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);

    await bubble(page, text).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Uzatish' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Bobur Yusupov/ }).click();
    await expect(page.getByRole('status').getByText(/Yo‘naltirildi.*Bobur/)).toBeVisible();

    await openChat(page, 'Bobur Yusupov');
    await expect(page.getByTestId('msg').filter({ hasText: text }).filter({ hasText: 'Yo‘naltirilgan' })).toHaveCount(1);
  });

  test('emoji picker inserts at the caret; formatting renders', async ({ loggedIn: page }) => {
    await openChat(page, 'Sardor Nazarov');
    const box = page.getByRole('textbox', { name: 'Xabar yozing...' });
    await box.fill('Salom **qalin** `kod`');
    await page.getByRole('button', { name: 'Emoji' }).click();
    await page.getByRole('dialog', { name: 'Emoji' }).getByRole('button', { name: '😀' }).click();
    await expect(box).toHaveValue('Salom **qalin** `kod`😀');
    await page.keyboard.press('Enter');
    const m = page.getByTestId('msg').filter({ hasText: 'Salom qalin kod😀' }).last();
    await expect(m.locator('strong')).toHaveText('qalin');
    await expect(m.locator('code')).toHaveText('kod');
  });

  test('channels are read-only', async ({ loggedIn: page }) => {
    await page.getByRole('searchbox').fill('Kun.uz');
    await openChat(page, 'Kun\\.uz yangiliklari');
    await expect(page.getByText('Bu kanalga faqat o‘qish mumkin')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Xabar yozing...' })).toHaveCount(0);
  });
});

test.describe('media', () => {
  test('mock history shows photo, file, voice and sticker', async ({ loggedIn: page }) => {
    await openChat(page, 'Jasur Aliyev');
    const log = page.getByRole('log');
    await expect(log.locator('img[alt$=".svg"]').first()).toBeVisible();
    await expect(log.locator('audio').first()).toBeAttached();
    await expect(log.locator('a[download]').first()).toContainText('hisobot');
    const photo = log.locator('img[alt$=".svg"]').first();
    await photo.scrollIntoViewIfNeeded(); // images are lazy-loaded
    await expect.poll(() => photo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  });

  test('upload an image with caption (preview dialog, lightbox) and a file', async ({ loggedIn: page }) => {
    await openChat(page, 'Dilnoza Rahimova');
    const caption = uniq('rasm izohi');
    await page.getByTestId('file-input').setInputFiles({ name: 'kichik.png', mimeType: 'image/png', buffer: PNG_1X1 });
    const dlg = page.getByRole('dialog', { name: 'Fayl yuborish' });
    await expect(dlg.getByText('kichik.png')).toBeVisible();
    await dlg.getByRole('textbox', { name: 'Izoh qo‘shing...' }).fill(caption);
    await dlg.getByRole('button', { name: 'Yuborish' }).click();

    const msg = page.getByTestId('msg').filter({ hasText: caption });
    await expect(msg).toHaveCount(1);
    await msg.locator('button img').click();
    const box = page.getByRole('dialog', { name: 'kichik.png' });
    await expect(box).toBeVisible();
    await expect(box.getByRole('link', { name: /Yuklab olish/ })).toHaveAttribute('href', /dl=1/);
    await page.keyboard.press('Escape');
    await expect(box).toHaveCount(0);

    await page.getByTestId('file-input').setInputFiles({ name: 'hujjat.txt', mimeType: 'text/plain', buffer: Buffer.from('salom fayl') });
    await page.getByRole('dialog', { name: 'Fayl yuborish' }).getByRole('button', { name: 'Yuborish' }).click();
    const card = page.getByRole('log').getByRole('link', { name: /hujjat\.txt/ }).last();
    await expect(card).toBeVisible();
    const res = await page.request.get((await card.getAttribute('href'))!);
    expect(await res.text()).toBe('salom fayl');
  });

  test('oversized files are rejected with a message', async ({ loggedIn: page }) => {
    await openChat(page, 'Dilnoza Rahimova');
    await page.getByTestId('file-input').setInputFiles({ name: 'ulkan.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(2 * 1024 * 1024) });
    await expect(page.getByRole('status').getByText(/Fayl juda katta \(max 1 MB\)/)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Fayl yuborish' })).toHaveCount(0);
  });

  test('drag and drop opens the upload preview', async ({ loggedIn: page }) => {
    await openChat(page, 'Nodira Ergasheva');
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File(['x'], 'tashlangan.txt', { type: 'text/plain' }));
      return d;
    });
    const section = page.getByRole('region', { name: /Nodira/ });
    await section.dispatchEvent('dragenter', { dataTransfer: dt });
    await expect(page.getByText('Fayllarni shu yerga tashlang')).toBeVisible();
    await section.dispatchEvent('drop', { dataTransfer: dt });
    await expect(page.getByRole('dialog', { name: 'Fayl yuborish' }).getByText('tashlangan.txt')).toBeVisible();
  });
});

test.describe('settings and appearance', () => {
  test('theme switch persists; language and font size apply', async ({ loggedIn: page }) => {
    await page.getByRole('button', { name: 'Menyu' }).click();
    await menu(page, 'Sozlamalar');
    const dlg = page.getByRole('dialog'); // its accessible name follows the UI language
    await expect(dlg.getByTestId('my-profile')).toContainText('@sinov_user');

    await dlg.getByRole('button', { name: 'Tashqi ko‘rinish' }).click();
    await dlg.getByRole('radio', { name: 'Qorong‘i' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await dlg.getByRole('radio', { name: 'Yorug‘' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await dlg.getByRole('radio', { name: 'Qorong‘i' }).click();
    await dlg.getByRole('button', { name: 'Orqaga' }).click();

    await dlg.getByRole('button', { name: 'Chat sozlamalari' }).click();
    await dlg.getByRole('slider').fill('18');
    await expect(page.locator('html')).toHaveCSS('font-size', '18px');
    await dlg.getByRole('button', { name: 'Orqaga' }).click();

    await dlg.getByRole('button', { name: 'Til' }).click();
    await dlg.getByRole('radio', { name: 'Русский' }).click();
    await expect(dlg.getByRole('heading', { name: 'Язык' })).toBeVisible();
    await dlg.getByRole('button', { name: 'Назад' }).click();
    await dlg.getByRole('button', { name: 'Уведомления и звуки' }).click();
    await dlg.getByRole('switch', { name: 'Звук сообщений' }).click();
    await page.keyboard.press('Escape'); // back to the list
    await expect(dlg.getByRole('heading', { name: 'Настройки' })).toBeVisible();
    await page.keyboard.press('Escape'); // closes
    await expect(page.getByRole('searchbox', { name: 'Поиск' })).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('html')).toHaveCSS('font-size', '18px');
    await expect(page.getByRole('searchbox', { name: 'Поиск' })).toBeVisible();
  });

  test('keyboard: Ctrl+K, arrows in the list, Escape closes the chat', async ({ loggedIn: page }) => {
    await openChat(page, 'Aziza Karimova');
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('searchbox')).toBeFocused();
    await expect(page.getByText('Suhbatni tanlang')).toBeVisible();

    const list = page.getByRole('list', { name: 'Chats' });
    await list.getByRole('button').first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('button').nth(1)).toBeFocused();

    await list.getByRole('button').nth(1).click();
    await expect(page.getByRole('log')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Suhbatni tanlang')).toBeVisible();
  });

  test('offline banner appears and clears', async ({ loggedIn: page, context, allowConsole }) => {
    allowConsole(/ERR_INTERNET_DISCONNECTED|ERR_NETWORK|WebSocket/); // expected while the network is cut
    await context.setOffline(true);
    await expect(page.getByText('Internet yo‘q')).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText('Internet yo‘q')).toHaveCount(0);
    await expect(page.getByText('Ulanmoqda')).toHaveCount(0, { timeout: 15_000 }); // reconnected
  });
});

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('list -> chat -> back, no horizontal scroll, composer stays on screen', async ({ loggedIn: page }) => {
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const aside = page.getByRole('complementary', { name: 'Chats' });
    await expect(aside).toBeVisible();
    expect(await noOverflow()).toBe(true);
    expect((await aside.boundingBox())!.width).toBeGreaterThanOrEqual(370);

    await openChat(page, 'Aziza Karimova');
    await expect(aside).toBeHidden();
    expect(await noOverflow()).toBe(true);
    const box = await page.getByRole('textbox', { name: 'Xabar yozing...' }).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(812);

    await page.getByRole('button', { name: 'Chatlar' }).click();
    await expect(aside).toBeVisible();
    await expect(page.getByRole('log')).toBeHidden();
  });

  test('long-press opens the message menu and info panel is full-screen', async ({ loggedIn: page }) => {
    await openChat(page, 'Aziza Karimova');
    const target = page.getByTestId('msg').last().locator('div[tabindex="0"]');
    await target.dispatchEvent('touchstart', { touches: [{ clientX: 120, clientY: 400, identifier: 1, target: await target.elementHandle() }] });
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Chat ma’lumoti' }).click();
    const panel = page.getByRole('complementary', { name: 'Ma’lumot' });
    await expect(panel).toBeVisible();
    expect((await panel.boundingBox())!.width).toBeGreaterThanOrEqual(370);
  });
});
