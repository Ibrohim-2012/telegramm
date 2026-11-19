import { bubble, expect, menu, openChat, test, uniq } from './fixtures';

test.describe('telegram features', () => {
  test('reactions: add from the menu, show a chip, toggle off, switch', async ({ loggedIn: page }) => {
    await openChat(page, 'Bobur Yusupov');
    const text = uniq('reaksiya');
    await page.getByRole('textbox', { name: 'Xabar yozing...' }).fill(text);
    await page.keyboard.press('Enter');
    await expect(bubble(page, text)).toBeVisible();

    await bubble(page, text).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '👍' }).click();
    const msg = page.getByTestId('msg').filter({ hasText: text }).first();
    await expect(msg.getByRole('button', { name: '👍 1' })).toHaveAttribute('aria-pressed', 'true');

    await bubble(page, text).click({ button: 'right' }); // switch to another emoji
    await page.getByRole('menuitem', { name: '🔥' }).click();
    await expect(msg.getByRole('button', { name: '🔥 1' })).toBeVisible();
    await expect(msg.getByRole('button', { name: '👍 1' })).toHaveCount(0);

    await msg.getByRole('button', { name: '🔥 1' }).click(); // chip click removes it
    await expect(msg.getByTestId('reactions')).toHaveCount(0);
  });

  test('chat list actions: pin, mute, mark as read', async ({ loggedIn: page }) => {
    const list = page.getByRole('list', { name: 'Chats' });
    const row = list.getByRole('button', { name: /Dilnoza Rahimova/ });

    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Mahkamlash' }).click();
    // a pinned chat floats to the top of the list
    await expect.poll(async () => (await list.getByRole('button').allInnerTexts()).findIndex((t) => t.includes('Dilnoza'))).toBeLessThan(5);

    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Ovozsiz qilish' }).click();
    await expect(row.getByTitle('muted')).toBeVisible();

    await row.click({ button: 'right' });
    const markRead = page.getByRole('menuitem', { name: 'O‘qilgan deb belgilash' });
    if (await markRead.count()) await markRead.click();
    else await page.keyboard.press('Escape');
    await expect(row.getByRole('img', { name: 'pinned' })).toBeVisible(); // nothing unread -> the pin icon shows

    // undo so other tests keep the original order
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Ovozni yoqish' }).click();
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Mahkamdan olish' }).click();
    await expect(row.getByRole('img', { name: 'pinned' })).toHaveCount(0);
  });

  test('search inside a chat and jump to an old result', async ({ loggedIn: page, request }) => {
    await openChat(page, 'Jasur Aliyev');
    const api = await request.get('http://localhost:4100/api/dialogs/1003/search?q=uzunroq&limit=30');
    const hits = (await api.json()).items as { id: number }[];
    expect(hits.length).toBeGreaterThan(2);
    const oldest = hits.at(-1)!.id;

    await page.getByRole('button', { name: 'Xabarlardan qidirish' }).click();
    await page.getByRole('textbox', { name: 'Chatda qidirish...' }).fill('uzunroq');
    await expect(page.getByTestId('search-hit').first()).toBeVisible();
    await expect(page.getByTestId('search-hit').first().locator('mark').first()).toHaveText(/uzunroq/i);
    await page.getByTestId('search-hit').last().click();

    await expect(page.getByRole('textbox', { name: 'Chatda qidirish...' })).toHaveCount(0); // search closed
    await expect(page.locator(`#msg-${oldest}`)).toBeVisible({ timeout: 15_000 }); // older pages were loaded for it

    await page.getByRole('button', { name: 'Xabarlardan qidirish' }).click();
    await page.getByRole('textbox', { name: 'Chatda qidirish...' }).fill('zzzzyyyy');
    await expect(page.getByText('Xabar topilmadi')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Chatda qidirish...' })).toHaveCount(0);
    await expect(page.getByRole('log')).toBeVisible(); // Escape closed only the search, not the chat
  });

  test('drafts are kept per chat and shown in the list', async ({ loggedIn: page }) => {
    await openChat(page, 'Aziza Karimova');
    const draft = uniq('qoralama sinov'); // contains the letter s: the list preview must not mangle it
    await page.getByRole('textbox', { name: 'Xabar yozing...' }).fill(draft);
    await page.waitForTimeout(600); // drafts are saved after a short pause
    await openChat(page, 'Bobur Yusupov');
    await expect(page.getByRole('textbox', { name: 'Xabar yozing...' })).toHaveValue('');
    const list = page.getByRole('list', { name: 'Chats' });
    await expect(list.getByRole('button', { name: /Aziza Karimova/ })).toContainText(`Qoralama: ${draft}`);

    await openChat(page, 'Aziza Karimova');
    await expect(page.getByRole('textbox', { name: 'Xabar yozing...' })).toHaveValue(draft);
    await page.getByRole('textbox', { name: 'Xabar yozing...' }).press('Enter'); // sending clears the draft
    await openChat(page, 'Bobur Yusupov');
    await expect(list.getByRole('button', { name: /Aziza Karimova/ })).not.toContainText('Qoralama');
  });

  test('chat wallpaper can be changed and persists', async ({ loggedIn: page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-wp', 'classic');
    await page.getByRole('button', { name: 'Menyu' }).click();
    await menu(page, 'Sozlamalar');
    await page.getByRole('button', { name: 'Chat sozlamalari' }).click();
    await page.getByRole('radio', { name: 'Osmon' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-wp', 'sky');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-wp', 'sky');
    const bg = await page.locator('.wallpaper').first().evaluate((e) => getComputedStyle(e).backgroundImage);
    expect(bg).toContain('linear-gradient');
  });

  test('1-3 emoji are big and bubble-less; Saved Messages has its own chat', async ({ loggedIn: page }) => {
    await openChat(page, 'Sardor Nazarov');
    await page.getByRole('textbox', { name: 'Xabar yozing...' }).fill('😂');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('msg').filter({ hasText: '😂' }).last().locator('span.text-6xl')).toBeVisible();

    await page.getByRole('list', { name: 'Chats' }).getByRole('button', { name: /Saqlangan xabarlar/ }).click();
    await expect(page.getByRole('region', { name: 'Saqlangan xabarlar' })).toBeVisible();
    const t = uniq('eslatma');
    await page.getByRole('textbox', { name: 'Xabar yozing...' }).fill(t);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('msg').filter({ hasText: t })).toHaveCount(1);
    await page.waitForTimeout(4500); // nobody answers in Saved Messages
    await expect(page.getByTestId('msg').filter({ hasText: 'Xabaringiz uchun rahmat' }).filter({ hasText: t.slice(0, 20) })).toHaveCount(0);
  });
});

test.describe('sidebar and drawer', () => {
  test('hamburger opens the drawer: profile, items, night switch, Escape', async ({ loggedIn: page }) => {
    await openChat(page, 'Aziza Karimova');
    await page.getByRole('button', { name: 'Menyu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menyu' });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Sinov Foydalanuvchi');
    await expect(drawer).toContainText('Emoji-status o‘rnatish');
    for (const item of ['Mening profilim', 'Guruh yaratish', 'Kanal yaratish', 'Kontaktlar', 'Qo‘ng‘iroqlar', 'Saqlangan xabarlar', 'Sozlamalar', 'Premium', 'Chiqish']) await expect(drawer.getByRole('button', { name: item }).first()).toBeVisible();

    const html = page.locator('html');
    const was = (await html.getAttribute('class'))?.includes('dark') ?? false;
    await drawer.getByRole('switch', { name: 'Tungi rejim' }).click();
    await expect(html).toHaveClass(was ? /^(?!.*dark)/ : /dark/);
    await drawer.getByRole('switch', { name: 'Tungi rejim' }).click();

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('log')).toBeVisible(); // Escape closed the drawer only, not the chat
  });

  test('drawer: Saved Messages and Contacts open chats', async ({ loggedIn: page }) => {
    await page.getByRole('button', { name: 'Menyu' }).click();
    await menu(page, 'Saqlangan xabarlar');
    await expect(page.getByRole('region', { name: 'Saqlangan xabarlar' })).toBeVisible();

    await page.getByRole('button', { name: 'Menyu' }).click();
    await menu(page, 'Kontaktlar');
    const dlg = page.getByRole('dialog', { name: 'Kontaktlar' });
    await dlg.getByRole('textbox').fill('Madina');
    await dlg.getByRole('button', { name: /Madina Ismoilova/ }).click();
    await expect(page.getByRole('region', { name: /Madina Ismoilova/ })).toBeVisible();
  });

  test('search field: hamburger turns into a back arrow, Escape clears without closing the chat', async ({ loggedIn: page }) => {
    await openChat(page, 'Aziza Karimova');
    const search = page.getByRole('searchbox');
    await expect(page.getByRole('button', { name: 'Menyu' })).toBeVisible();
    await search.click();
    await search.fill('Bobur');
    const back = page.getByRole('button', { name: 'Orqaga' });
    await expect(back).toBeVisible();
    await back.click();
    await expect(search).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Menyu' })).toBeVisible();

    await search.click();
    await search.fill('zzz');
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('');
    await expect(page.getByRole('log')).toBeVisible();
  });

  test('desktop: folders are a vertical rail on the left with the hamburger on top; counters show unread chats', async ({ loggedIn: page }) => {
    const rail = page.getByRole('navigation', { name: 'Folders' });
    const all = rail.getByRole('button', { name: /Barchasi/ });
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await expect(all.locator('span span').first()).toBeVisible(); // unread-chats counter
    const mb = (await page.getByRole('button', { name: 'Menyu' }).boundingBox())!;
    const rb = (await rail.boundingBox())!;
    const sb = (await page.getByRole('searchbox').boundingBox())!;
    expect(mb.x + mb.width).toBeLessThan(rb.x + rb.width + 1); // hamburger sits in the rail
    expect(mb.y).toBeLessThan(rb.y); // above the folders
    expect(sb.x).toBeGreaterThan(rb.x + rb.width - 1); // search is to the right of the rail
    const a = (await all.boundingBox())!;
    const g = (await rail.getByRole('button', { name: /Guruhlar/ }).boundingBox())!;
    expect(g.y).toBeGreaterThan(a.y + a.height - 1); // stacked vertically
    await rail.getByRole('button', { name: /Guruhlar/ }).click();
    await expect(rail.getByRole('button', { name: /Guruhlar/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('list', { name: 'Chats' }).getByRole('button', { name: /Aziza Karimova/ })).toHaveCount(0); // private chat filtered out
  });

  for (const [name, size] of [
    ['phone', { width: 390, height: 800 }],
    ['tablet', { width: 800, height: 1000 }],
  ] as const) {
    test(`${name}: folders stay on top as tabs with a sliding underline; hamburger next to the search`, async ({ loggedIn: page }) => {
      await page.setViewportSize(size);
      const nav = page.getByRole('navigation', { name: 'Folders' });
      const bar = nav.locator('span[aria-hidden="true"]').last();
      const all = nav.getByRole('button', { name: /Barchasi/ });
      await expect(all).toHaveAttribute('aria-pressed', 'true');
      const menuBtn = (await page.getByRole('button', { name: 'Menyu' }).boundingBox())!;
      const search = (await page.getByRole('searchbox').boundingBox())!;
      const navBox = (await nav.boundingBox())!;
      expect(menuBtn.x).toBeLessThan(search.x); // beside the search field
      expect(navBox.y).toBeGreaterThan(search.y); // tabs below it
      expect(navBox.width).toBeGreaterThan(search.width); // a full-width row above the list, not a narrow rail
      const x0 = (await bar.boundingBox())!.x;
      await nav.getByRole('button', { name: /Guruhlar/ }).click();
      await expect.poll(async () => (await bar.boundingBox())!.x).toBeGreaterThan(x0 + 40);
      await expect(nav.getByRole('button', { name: /Guruhlar/ })).toHaveAttribute('aria-pressed', 'true');
    });
  }

  test('pencil button opens "new message" and starts a chat; rows show "Siz:" and read marks', async ({ loggedIn: page }) => {
    await openChat(page, 'Bobur Yusupov');
    const text = uniq('siz prefiksi');
    await page.getByRole('textbox', { name: 'Xabar yozing...' }).fill(text);
    await page.keyboard.press('Enter');
    const row = page.getByRole('list', { name: 'Chats' }).getByRole('button', { name: /Bobur Yusupov/ });
    await expect(row).toContainText('Siz:');
    await expect(row.getByLabel(/read|sent/)).toBeVisible();

    await page.getByRole('button', { name: 'Yangi xabar' }).click();
    const dlg = page.getByRole('dialog', { name: 'Yangi xabar' });
    await dlg.getByRole('textbox').fill('Timur');
    await dlg.getByRole('button', { name: /Timur Saidov/ }).first().click();
    await expect(page.getByRole('region', { name: /Timur Saidov/ })).toBeVisible();
  });

  test('ripple effect appears on click, typing shows animated dots in the list', async ({ loggedIn: page }) => {
    const row = page.getByRole('list', { name: 'Chats' }).getByRole('button').nth(3);
    await row.dispatchEvent('pointerdown', { clientX: 100, clientY: 400, bubbles: true });
    await expect(row.locator('span.ripple')).toHaveCount(1);
    await expect(row.locator('span.ripple')).toHaveCount(0, { timeout: 3000 }); // removed after the animation
  });

  test('connection bar shows while offline', async ({ loggedIn: page, context, allowConsole }) => {
    allowConsole(/ERR_INTERNET_DISCONNECTED|ERR_NETWORK|WebSocket/);
    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'Internet yo‘q' })).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'Internet yo‘q' })).toHaveCount(0);
  });
});
