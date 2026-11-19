import { expect, menu, test, uniq } from './fixtures';

test.describe('side menu dialogs', () => {
  test('"Mening profilim" shows the account', async ({ loggedIn: page }) => {
    await page.getByRole('button', { name: 'Menyu' }).click();
    await menu(page, 'Mening profilim');
    const dlg = page.getByRole('dialog', { name: 'Mening profilim' });
    await expect(dlg).toContainText('Sinov Foydalanuvchi');
    await expect(dlg).toContainText('@sinov_user');
    await expect(dlg).toContainText('+998901234567');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
  });

  test('create a group: needs a name and members, then opens it', async ({ loggedIn: page }) => {
    await page.getByRole('button', { name: 'Menyu' }).click();
    await menu(page, 'Guruh yaratish');
    const dlg = page.getByRole('dialog', { name: 'Yangi guruh' });
    const create = dlg.getByRole('button', { name: 'Yaratish' });
    await expect(create).toBeDisabled();
    const title = uniq('Guruh');
    await dlg.getByRole('textbox', { name: 'Guruh nomi' }).fill(title);
    await expect(create).toBeDisabled(); // still no members
    await dlg.getByRole('checkbox', { name: /Madina Ismoilova/ }).click();
    await dlg.getByRole('checkbox', { name: /Timur Saidov/ }).click();
    await expect(dlg).toContainText('· 2');
    await create.click();
    await expect(page.getByRole('region', { name: new RegExp(title) })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Chats' }).getByRole('button', { name: new RegExp(title) })).toBeVisible();
    await expect(page.getByText('Guruh yaratildi')).toBeVisible();
  });

  test('create a channel with a description', async ({ loggedIn: page }) => {
    await page.getByRole('button', { name: 'Menyu' }).click();
    await menu(page, 'Kanal yaratish');
    const dlg = page.getByRole('dialog', { name: 'Yangi kanal' });
    const title = uniq('Kanal');
    await dlg.getByRole('textbox', { name: 'Kanal nomi' }).fill(title);
    await dlg.getByRole('textbox', { name: /Tavsif/ }).fill('sinov kanali');
    await dlg.getByRole('button', { name: 'Yaratish' }).click();
    await expect(page.getByRole('region', { name: new RegExp(title) })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Chats' }).getByRole('button', { name: new RegExp(title) })).toBeVisible();
  });

  test('calls: history list with missed/outgoing marks; a row opens the chat', async ({ loggedIn: page }) => {
    await page.getByRole('button', { name: 'Menyu' }).click();
    await menu(page, 'Qo‘ng‘iroqlar');
    const dlg = page.getByRole('dialog', { name: 'Qo‘ng‘iroqlar' });
    const rows = dlg.getByTestId('calls-list').getByRole('button');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(2);
    await expect(dlg).toContainText('Javobsiz');
    await expect(dlg).toContainText('Chiquvchi');
    await expect(dlg).toContainText('brauzerda mavjud emas'); // honest note: history only
    await rows.first().click();
    await expect(page.getByRole('log')).toBeVisible();
    await expect(dlg).toHaveCount(0);
  });
});

test.describe('archive', () => {
  test('archived chats leave the main list, wait in the archive, and can be taken out again', async ({ loggedIn: page }) => {
    const list = page.getByRole('list', { name: 'Chats' });
    const row = list.getByRole('button', { name: /Bobur Yusupov/ });
    await expect(row).toBeVisible();
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Arxivga olish' }).click();
    await expect(row).toHaveCount(0); // gone from the main list

    const archive = page.getByTestId('archive-row');
    await expect(archive).toContainText('Arxivlangan chatlar');
    await archive.click();
    await expect(list.getByRole('button', { name: /Bobur Yusupov/ })).toBeVisible(); // it waits here
    await expect(list.getByRole('button', { name: /Aziza Karimova/ })).toHaveCount(0); // others are not in the archive

    await page.reload(); // it stays archived on the server, not just in the browser
    await expect(page.getByTestId('archive-row')).toBeVisible();
    await expect(list.getByRole('button', { name: /Bobur Yusupov/ })).toHaveCount(0);
    await page.getByRole('searchbox').fill('Bobur'); // search still finds it
    await expect(list.getByRole('button', { name: /Bobur Yusupov/ })).toBeVisible();
    await page.getByRole('searchbox').fill('');

    await page.getByTestId('archive-row').click();
    await list.getByRole('button', { name: /Bobur Yusupov/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Arxivdan chiqarish' }).click();
    await expect(page.getByRole('list', { name: 'Chats' }).getByRole('button', { name: /Aziza Karimova/ })).toBeVisible(); // archive emptied -> back to the main list
    await expect(list.getByRole('button', { name: /Bobur Yusupov/ })).toBeVisible();
    await expect(page.getByTestId('archive-row')).toHaveCount(0);
  });
});

test.describe('multiple accounts', () => {
  test('add a second account, switch between them, cancel an add, sign out of both', async ({ loggedIn: page }) => {
    const openMenu = async () => {
      await page.getByRole('button', { name: 'Menyu', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Menyu' })).toContainText('Sinov Foydalanuvchi');
    };
    const drawer = page.getByRole('dialog', { name: 'Menyu' });

    // add: login screen with a way back
    await openMenu();
    await drawer.getByRole('button', { name: 'Akkauntlar' }).click();
    await expect(drawer.getByTestId('accounts')).toContainText('+998901234567');
    await drawer.getByRole('button', { name: 'Akkaunt qo‘shish' }).click();
    await expect(page.getByRole('heading', { name: 'Telegramga kirish' })).toBeVisible();
    await page.getByRole('button', { name: 'Bekor qilish' }).click();
    await expect(page.getByRole('searchbox')).toBeVisible(); // back in the first account
    await expect(page.getByRole('list', { name: 'Chats' }).getByRole('button').first()).toBeVisible();

    // add for real
    await openMenu();
    await drawer.getByRole('button', { name: 'Akkauntlar' }).click();
    await drawer.getByRole('button', { name: 'Akkaunt qo‘shish' }).click();
    await page.getByRole('textbox', { name: 'Telefon raqami' }).fill('901234568');
    await page.getByRole('button', { name: 'Davom etish' }).click();
    await page.getByRole('textbox', { name: 'Tasdiqlash kodi' }).fill('12345');
    await page.getByRole('button', { name: 'Davom etish' }).click();
    await expect(page.getByRole('searchbox')).toBeVisible();
    await page.getByRole('button', { name: 'Menyu', exact: true }).click();
    await expect(drawer).toContainText('Sinov Foydalanuvchi 2');
    await drawer.getByRole('button', { name: 'Akkauntlar' }).click();
    const list = drawer.getByTestId('accounts');
    await expect(list).toContainText('+998901234567');
    await expect(list).toContainText('+998901234568');

    // switch back to the first one
    await list.getByRole('button', { name: /\+998901234567/ }).click();
    await expect(page.getByRole('list', { name: 'Chats' }).getByRole('button').first()).toBeVisible();
    await page.getByRole('button', { name: 'Menyu', exact: true }).click();
    await expect(drawer.getByTestId('drawer-name')).toHaveText(/^Sinov Foydalanuvchi$/);

    // sign out of the first: the second takes over; sign out of that too
    await drawer.getByRole('button', { name: 'Chiqish' }).click();
    await expect(page.getByRole('list', { name: 'Chats' }).getByRole('button').first()).toBeVisible();
    await page.getByRole('button', { name: 'Menyu', exact: true }).click();
    await expect(drawer.getByTestId('drawer-name')).toContainText('Sinov Foydalanuvchi 2');
    await drawer.getByRole('button', { name: 'Chiqish' }).click();
    await expect(page.getByRole('heading', { name: 'Telegramga kirish' })).toBeVisible();
  });
});
