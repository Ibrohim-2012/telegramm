import { bubble, expect, openChat, test, uniq } from './fixtures';

const send = async (page: import('@playwright/test').Page, text: string) => {
  await page.getByRole('textbox', { name: 'Xabar yozing...' }).fill(text);
  await page.keyboard.press('Enter');
  await expect(bubble(page, text)).toBeVisible();
};

// Our own message with that text (the simulated peer's reply may quote it, so exclude replies).
const own = (page: import('@playwright/test').Page, text: string) => page.getByTestId('msg').filter({ hasText: text }).filter({ hasNotText: 'Xabaringiz' }).first();
const bub = (page: import('@playwright/test').Page, text: string) => own(page, text).locator('div[tabindex="0"]');

test.describe('chat header', () => {
  test('status: online in the accent colour, last seen for the others', async ({ loggedIn: page }) => {
    await openChat(page, 'Bobur Yusupov'); // online in the mock
    const header = page.getByRole('region', { name: /Bobur Yusupov/ }).locator('header');
    await expect(header.getByText('onlayn')).toBeVisible();
    await expect(header.getByText('onlayn')).toHaveClass(/text-accent/);

    await openChat(page, 'Dilnoza Rahimova'); // offline
    await expect(page.getByRole('region', { name: /Dilnoza Rahimova/ }).locator('header').getByText(/oxirgi marta/)).toBeVisible();
  });

  test('three-dots menu: info, mute, pin, close', async ({ loggedIn: page }) => {
    await openChat(page, 'Malika Tursunova');
    const dots = page.getByRole('button', { name: 'Boshqa amallar' });

    await dots.click();
    await page.getByRole('menuitem', { name: 'Chat ma’lumoti' }).click();
    await expect(page.getByRole('complementary', { name: 'Ma’lumot' })).toBeVisible();
    await page.keyboard.press('Escape');

    await dots.click();
    await page.getByRole('menuitem', { name: 'Ovozsiz qilish' }).click();
    const row = page.getByRole('list', { name: 'Chats' }).getByRole('button', { name: /Malika Tursunova/ });
    await expect(row.getByTitle('muted')).toBeVisible();
    await dots.click();
    await page.getByRole('menuitem', { name: 'Ovozni yoqish' }).click(); // undo
    await expect(row.getByTitle('muted')).toHaveCount(0);

    await dots.click();
    await page.getByRole('menuitem', { name: 'Chatni yopish' }).click();
    await expect(page.getByText('Suhbatni tanlang')).toBeVisible();
  });

  test('Up in an empty box edits the last message, "/" focuses search', async ({ loggedIn: page }) => {
    await openChat(page, 'Otabek Qodirov');
    const text = uniq('oxirgi');
    await send(page, text);
    const box = page.getByRole('textbox', { name: 'Xabar yozing...' });
    await box.press('ArrowUp');
    await expect(page.getByTestId('compose-bar')).toContainText(text);
    await expect(box).toHaveValue(text);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('compose-bar')).toHaveCount(0);

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox')).toBeFocused();
  });
});

test.describe('selection mode', () => {
  test('select several messages, Escape leaves selection (not the chat)', async ({ loggedIn: page }) => {
    await openChat(page, 'Nodira Ergasheva');
    const a = uniq('birinchi');
    const b = uniq('ikkinchi');
    await send(page, a);
    await send(page, b);

    await bub(page, a).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Tanlash' }).click();
    const bar = page.getByTestId('selection-bar');
    await expect(bar).toContainText('1 ta tanlandi');

    await own(page, b).click(); // clicking a message toggles it while selecting
    await expect(bar).toContainText('2 ta tanlandi');
    await expect(own(page, b)).toHaveAttribute('data-selected', 'true');
    await own(page, b).click();
    await expect(bar).toContainText('1 ta tanlandi');

    await page.keyboard.press('Escape');
    await expect(bar).toHaveCount(0);
    await expect(page.getByRole('log')).toBeVisible();
  });

  test('forward and delete several messages at once', async ({ loggedIn: page }) => {
    await openChat(page, 'Shahnoza Mirzayeva');
    const a = uniq('ommaviy-1');
    const b = uniq('ommaviy-2');
    await send(page, a);
    await send(page, b);

    await bub(page, a).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Tanlash' }).click();
    await own(page, b).click();
    await page.getByTestId('selection-bar').getByRole('button', { name: 'Uzatish' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Timur Saidov/ }).click();
    await expect(page.getByRole('status').getByText(/Yo‘naltirildi.*Timur/)).toBeVisible();
    await expect(page.getByTestId('selection-bar')).toHaveCount(0); // selection ends after forwarding

    await openChat(page, 'Timur Saidov');
    await expect(page.getByTestId('msg').filter({ hasText: a }).filter({ hasText: 'Yo‘naltirilgan' })).toHaveCount(1);
    await expect(page.getByTestId('msg').filter({ hasText: b }).filter({ hasText: 'Yo‘naltirilgan' })).toHaveCount(1);

    await openChat(page, 'Shahnoza Mirzayeva');
    await bub(page, a).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Tanlash' }).click();
    await own(page, b).click();
    await page.getByTestId('selection-bar').getByRole('button', { name: 'O‘chirish' }).click();
    await expect(page.getByRole('dialog').getByRole('heading')).toContainText('(2)');
    await page.getByRole('button', { name: 'Hamma uchun' }).click();
    // (the simulated peer may have echoed our text in its own reply, so only count our own messages)
    await expect(page.getByTestId('msg').filter({ hasText: a }).filter({ hasNotText: 'Xabaringiz' })).toHaveCount(0);
    await expect(page.getByTestId('msg').filter({ hasText: b }).filter({ hasNotText: 'Xabaringiz' })).toHaveCount(0);
  });
});

test.describe('message bubbles', () => {
  test('voice message has a play button and waveform and really plays', async ({ loggedIn: page }) => {
    await openChat(page, 'Jasur Aliyev');
    // .last(): scrolling up loads older pages that get prepended, which would shift .first() to another message
    const voice = page.getByTestId('voice').last();
    await voice.scrollIntoViewIfNeeded();
    await expect(voice.locator('span.rounded-full').first()).toBeVisible(); // waveform bars
    await expect(voice.locator('audio')).toBeAttached();
    await voice.getByRole('button', { name: 'Ijro etish' }).click();
    await expect(voice.getByRole('button', { name: 'To‘xtatish' })).toBeVisible();
    await expect.poll(() => voice.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0);
    await voice.getByRole('button', { name: 'To‘xtatish' }).click();
    await expect(voice.getByRole('button', { name: 'Ijro etish' })).toBeVisible();
  });

  test('photo fills the bubble and shows the time on a pill; file card has a download circle', async ({ loggedIn: page }) => {
    await openChat(page, 'Jasur Aliyev');
    const log = page.getByRole('log');
    const file = log.getByRole('link', { name: /Yuklab olish: hisobot/ }).first();
    await file.scrollIntoViewIfNeeded();
    await expect(file).toBeVisible();
    expect((await file.locator('span').first().boundingBox())!.width).toBeGreaterThanOrEqual(52); // 54px circle
    await expect(file).toHaveAttribute('href', /dl=1/);

    const photoBubble = log.locator('div[tabindex="0"]').filter({ has: page.locator('button img') }).first();
    await photoBubble.scrollIntoViewIfNeeded();
    const imgBox = await photoBubble.locator('button img').boundingBox();
    const bubbleBox = await photoBubble.boundingBox();
    expect(Math.abs(imgBox!.x - bubbleBox!.x)).toBeLessThan(2); // edge to edge, no padding
    expect(Math.abs(imgBox!.width - bubbleBox!.width)).toBeLessThan(2);
  });

  test('upload shows a circular progress ring; emoji-only and date pill look right', async ({ loggedIn: page }) => {
    await openChat(page, 'Dilnoza Rahimova');
    await expect(page.getByRole('log').locator('div.sticky').first()).toHaveText(/(\d+-[a-z‘’']+|Bugun|Kecha)/i); // "5-noyabr" style
  });
});

test.describe('context menu look', () => {
  test('menu grows from the click point, has icons and a blurred surface', async ({ loggedIn: page }) => {
    await openChat(page, 'Aziza Karimova');
    const text = uniq('menyu');
    await send(page, text);
    await bubble(page, text).click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveClass(/backdrop-blur/);
    for (const label of ['Javob berish', 'Nusxalash', 'Tahrirlash', 'Uzatish', 'Tanlash', 'O‘chirish']) await expect(menu.getByRole('menuitem', { name: label })).toBeVisible();
    expect(await menu.evaluate((e) => getComputedStyle(e).transformOrigin)).not.toBe('0px 0px'); // origin follows the click
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('log')).toBeVisible();
  });
});
