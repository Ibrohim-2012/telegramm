import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { AccountManager, MAX_ACCOUNTS } from '../src/services/AccountManager.js';
import { MockTelegramService, MOCK_CODE } from '../src/services/MockTelegramService.js';
import type { TgEvent } from '../src/types.js';

const make = (file: string | null = null) => new AccountManager((slot) => new MockTelegramService({ realtimeMs: 0, slot }), file);

async function login(m: AccountManager, phone: string) {
  await m.sendCode(phone);
  expect(await m.signIn(MOCK_CODE)).toBe('ready');
}

describe('AccountManager', () => {
  it('keeps several accounts side by side and switches between them', async () => {
    const m = make();
    await login(m, '+998901234567');
    expect((await m.getMe()).phone).toBe('+998901234567');

    expect(m.addAccount()).toBe(1);
    expect(m.getAuthState()).toBe('logged_out'); // the normal login screen signs the new one in
    await login(m, '+998901234568');
    const me2 = await m.getMe();
    expect(me2).toMatchObject({ phone: '+998901234568', lastName: 'Foydalanuvchi 2' });

    const list = await m.list();
    expect(list.map((a) => [a.slot, a.active, a.me?.phone])).toEqual([
      [0, false, '+998901234567'],
      [1, true, '+998901234568'],
    ]);

    m.switchTo(0);
    expect((await m.getMe()).phone).toBe('+998901234567'); // the first account is untouched
    expect(() => m.switchTo(7)).toThrowError(expect.objectContaining({ code: 'BAD_INPUT' }));
  });

  it('limits the number of accounts', async () => {
    const m = make();
    await login(m, '+998901234567');
    for (let i = 1; i < MAX_ACCOUNTS; i++) {
      m.addAccount();
      await login(m, `+99890123456${i}`);
    }
    expect(() => m.addAccount()).toThrowError(expect.objectContaining({ code: 'ACCOUNT_LIMIT' }));
  });

  it('cancelling an unfinished sign-in returns to the previous account and forgets the empty slot', async () => {
    const m = make();
    await login(m, '+998901234567');
    m.addAccount();
    expect(m.getAuthState()).toBe('logged_out');
    await m.cancelAdd();
    expect(m.getAuthState()).toBe('ready');
    expect((await m.list()).length).toBe(1);
    await m.cancelAdd(); // harmless when nothing is pending
    expect(m.getAuthState()).toBe('ready');
  });

  it('only the active account\'s events are forwarded', async () => {
    const m = make();
    await login(m, '+998901234567');
    m.addAccount();
    await login(m, '+998901234568');
    const seen: TgEvent[] = [];
    m.onEvent((e) => seen.push(e));
    const dialogs = (await m.getDialogs({ limit: 5, offset: 0 })).items;
    await m.sendMessage(dialogs[0]!.id, 'salom'); // account 2 is active: event arrives
    const n = seen.length;
    expect(n).toBeGreaterThan(0);
    m.switchTo(0);
    await m.sendMessage(dialogs[0]!.id, 'salom 2');
    expect(seen.length).toBeGreaterThan(n);
  });

  it('logging out of the active account removes it and the next one takes over; the last one just logs out', async () => {
    const m = make();
    await login(m, '+998901234567');
    m.addAccount();
    await login(m, '+998901234568');
    await m.logout();
    expect(m.getAuthState()).toBe('ready');
    expect((await m.getMe()).phone).toBe('+998901234567');
    expect((await m.list()).length).toBe(1);
    await m.logout();
    expect(m.getAuthState()).toBe('logged_out');
    expect((await m.list()).length).toBe(1); // slot 0 stays for the next login
  });

  it('remembers the accounts and the active one across restarts', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mt-acc-')), 'accounts.json');
    const a = make(file);
    await login(a, '+998901234567');
    a.addAccount();
    await login(a, '+998901234568');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as { slots: number[]; active: number };
    expect(saved).toEqual({ slots: [0, 1], active: 1 });
    const b = make(file); // restart (mock sessions are not persisted, the layout is)
    expect(b.getAuthState()).toBe('logged_out');
    expect((await b.list()).map((x) => x.slot)).toEqual([1]); // slot 1 was active; slot 0 has no live session in mock mode
  });
});

describe('accounts API', () => {
  it('lists, adds, switches and cancels', async () => {
    const m = make();
    const app = createApp(m, 'http://localhost:3000');
    await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
    await request(app).post('/api/auth/code').send({ code: MOCK_CODE });

    const l0 = await request(app).get('/api/accounts');
    expect(l0.body).toMatchObject({ max: MAX_ACCOUNTS, state: 'ready' });
    expect(l0.body.items).toHaveLength(1);

    const add = await request(app).post('/api/accounts');
    expect(add.status).toBe(201);
    expect(add.body.state).toBe('logged_out');
    expect((await request(app).get('/api/me')).status).toBe(401); // login screen until signed in
    await request(app).post('/api/auth/phone').send({ phone: '+998901234568' });
    await request(app).post('/api/auth/code').send({ code: MOCK_CODE });
    expect((await request(app).get('/api/me')).body.phone).toBe('+998901234568');

    const sw = await request(app).post('/api/accounts/0/switch');
    expect(sw.body.items.find((a: { active: boolean }) => a.active).slot).toBe(0);
    expect((await request(app).get('/api/me')).body.phone).toBe('+998901234567');
    expect((await request(app).post('/api/accounts/5/switch')).status).toBe(400);

    await request(app).post('/api/accounts'); // fills slot... then cancel
    const cancel = await request(app).post('/api/accounts/cancel');
    expect(cancel.body.state).toBe('ready');
  });

  it('is not offered with a single plain service', async () => {
    const app = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    expect((await request(app).get('/api/accounts')).status).toBe(404);
  });
});

describe('startup with rejected sessions', () => {
  it('keeps one empty slot as the active account instead of pointing at a dropped one', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mt-acc2-')), 'accounts.json');
    fs.writeFileSync(file, JSON.stringify({ slots: [0, 1], active: 0 }));
    const m = make(file);
    await m.init(); // mock services start logged out, like sessions Telegram rejected
    expect(m.getAuthState()).toBe('logged_out'); // no crash: there is an active account
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ slots: [0], active: 0 });
    expect((await m.list()).map((a) => a.slot)).toEqual([0]);
  });
});
