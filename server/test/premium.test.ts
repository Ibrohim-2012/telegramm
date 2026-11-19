import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { addMonths, PremiumStore } from '../src/premium.js';
import { MockTelegramService, MOCK_CODE } from '../src/services/MockTelegramService.js';

const SECRET = 'premium-test-secret-premium-test-secret';
const DAY = 86_400_000;
const T0 = new Date(2026, 0, 15, 12).getTime();

let clock = T0;
let file: string;
const store = () => new PremiumStore(file, SECRET, () => clock, 2);

beforeEach(() => {
  clock = T0;
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mt-prem-')), 'premium.json');
});

describe('PremiumStore: free trial', () => {
  it('starts with no premium, a trial lasts two calendar months, then expires', () => {
    const s = store();
    expect(s.status()).toMatchObject({ state: 'none', active: false, trialUsed: false });
    const st = s.startTrial();
    expect(st).toMatchObject({ state: 'trial', active: true, trialUsed: true });
    expect(st.until).toBe(addMonths(T0, 2));
    clock = addMonths(T0, 2) - DAY;
    expect(s.status()).toMatchObject({ state: 'trial', active: true, daysLeft: 1 });
    clock = addMonths(T0, 2) + 1000;
    expect(s.status()).toMatchObject({ state: 'expired', active: false, daysLeft: undefined });
  });

  it('the trial can only be used once', () => {
    const s = store();
    s.startTrial();
    expect(() => s.startTrial()).toThrowError(expect.objectContaining({ code: 'TRIAL_USED' }));
    clock = addMonths(T0, 5);
    expect(() => s.startTrial()).toThrowError(expect.objectContaining({ code: 'TRIAL_USED' })); // not even after it ended
  });

  it('survives a restart', () => {
    store().startTrial();
    clock += 10 * DAY;
    expect(store().status()).toMatchObject({ state: 'trial', trialUsed: true });
  });
});

describe('PremiumStore: paid months with codes', () => {
  it('a code adds months, works once, and rejects forgeries', () => {
    const s = store();
    const code = PremiumStore.makeCode(SECRET, 3);
    const st = s.redeem(code);
    expect(st).toMatchObject({ state: 'active', active: true });
    expect(st.until).toBe(addMonths(T0, 3));
    expect(() => s.redeem(code)).toThrowError(expect.objectContaining({ code: 'CODE_USED' }));
    expect(() => store().redeem(code)).toThrowError(expect.objectContaining({ code: 'CODE_USED' })); // remembered after restart
    for (const bad of ['', 'MT-1-AAAAAAAAAA-BBBBBBBBBBBB', 'garbage', code.replace(/.$/, code.endsWith('0') ? '1' : '0'), PremiumStore.makeCode('another-secret-another-secret-123', 1)]) {
      expect(() => store().redeem(bad), bad).toThrowError(expect.objectContaining({ code: 'CODE_INVALID' }));
    }
    expect(() => s.redeem(PremiumStore.makeCode(SECRET, 99))).toThrowError(expect.objectContaining({ code: 'CODE_INVALID' })); // absurd length
  });

  it('months stack on top of the remaining trial and paid time', () => {
    const s = store();
    s.startTrial(); // until T0 + 2 months
    const a = s.redeem(PremiumStore.makeCode(SECRET, 1));
    expect(a.until).toBe(addMonths(addMonths(T0, 2), 1)); // after the trial, not from today
    clock = addMonths(T0, 1);
    const b = s.redeem(PremiumStore.makeCode(SECRET, 1));
    expect(b.until).toBe(addMonths(addMonths(T0, 3), 1));
    expect(b.state).toBe('active');
  });

  it('a paid code revives an expired account', () => {
    const s = store();
    s.startTrial();
    clock = addMonths(T0, 3);
    expect(s.status().state).toBe('expired');
    expect(s.redeem(PremiumStore.makeCode(SECRET, 1))).toMatchObject({ state: 'active', active: true });
  });
});

describe('PremiumStore: perks and integrity', () => {
  it('settings need active premium and disappear when it ends', () => {
    const s = store();
    expect(() => s.updateSettings({ emojiStatus: '🔥' })).toThrowError(expect.objectContaining({ code: 'PREMIUM_REQUIRED' }));
    s.startTrial();
    expect(s.updateSettings({ emojiStatus: '🔥', accent: 'pink' }).settings).toEqual({ emojiStatus: '🔥', accent: 'pink' });
    expect(s.updateSettings({ emojiStatus: null }).settings).toEqual({ accent: 'pink' });
    clock = addMonths(T0, 3);
    expect(s.status().settings).toEqual({}); // stored, but not applied while expired
    expect(() => s.updateSettings({ accent: 'blue' })).toThrowError(expect.objectContaining({ code: 'PREMIUM_REQUIRED' }));
    s.redeem(PremiumStore.makeCode(SECRET, 1));
    expect(s.status().settings).toEqual({ accent: 'pink' }); // comes back with premium
  });

  it('a hand-edited state file is ignored', () => {
    store().startTrial();
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { body: string; sig: string };
    const body = JSON.parse(raw.body) as { paidUntil?: number };
    body.paidUntil = addMonths(T0, 120); // pretend to have ten years
    fs.writeFileSync(file, JSON.stringify({ body: JSON.stringify(body), sig: raw.sig }));
    expect(store().status().until).not.toBe(addMonths(T0, 120));
    expect(store().status()).toMatchObject({ state: 'none', active: false });
    fs.writeFileSync(file, 'not json at all');
    expect(store().status().state).toBe('none'); // corrupted -> clean start, no crash
  });

  it('codes from one installation do not work on another', () => {
    const code = PremiumStore.makeCode('secret-A-secret-A-secret-A-secret-A', 1);
    expect(() => store().redeem(code)).toThrowError(expect.objectContaining({ code: 'CODE_INVALID' }));
  });
});

describe('Premium API', () => {
  const make = (opts = {}) => {
    const app = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000', {
      secret: SECRET,
      premium: store(),
      maxUploadBytes: 1000,
      premiumUploadBytes: 5000,
      premiumPrice: '10 000 so‘m / oy',
      premiumBuyUrl: 'https://t.me/seller',
      ...opts,
    });
    return app;
  };
  const login = async (app: ReturnType<typeof make>) => {
    await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
    await request(app).post('/api/auth/code').send({ code: MOCK_CODE });
  };

  it('reports status, price, limits; trial once; codes; settings', async () => {
    const app = make();
    const s0 = await request(app).get('/api/premium');
    expect(s0.body).toMatchObject({ state: 'none', active: false, trialMonths: 2, price: '10 000 so‘m / oy', buyUrl: 'https://t.me/seller', uploadMb: { free: 0, premium: 0 } });
    expect(s0.body.accents).toContain('pink');

    expect((await request(app).post('/api/premium/settings').send({ accent: 'pink' })).status).toBe(402);
    const t = await request(app).post('/api/premium/trial');
    expect(t.status).toBe(201);
    expect(t.body).toMatchObject({ state: 'trial', active: true });
    expect((await request(app).post('/api/premium/trial')).status).toBe(409);

    const st = await request(app).post('/api/premium/settings').send({ emojiStatus: '🚀', accent: 'teal' });
    expect(st.body.settings).toEqual({ emojiStatus: '🚀', accent: 'teal' });
    expect((await request(app).post('/api/premium/settings').send({ accent: 'purple-haze' })).status).toBe(400);

    const code = PremiumStore.makeCode(SECRET, 1);
    const r = await request(app).post('/api/premium/redeem').send({ code });
    expect(r.body.state).toBe('active');
    expect((await request(app).post('/api/premium/redeem').send({ code })).status).toBe(409);
    expect((await request(app).post('/api/premium/redeem').send({ code: 'MT-1-AAAAAAAAAA-BBBBBBBBBBBB' })).status).toBe(400);
    expect((await request(app).post('/api/premium/redeem').send({})).status).toBe(400);
  });

  it('upload limit: small for everyone, larger with premium, with a hint to upgrade', async () => {
    const app = make();
    await login(app);
    const big = Buffer.alloc(3000);
    const free = await request(app).post('/api/dialogs/1000/upload').attach('file', big, 'big.bin');
    expect(free.status).toBe(413);
    expect(free.body.error).toMatchObject({ code: 'FILE_TOO_BIG', premiumLimitMb: expect.any(Number) });
    expect((await request(app).post('/api/dialogs/1000/upload').attach('file', Buffer.alloc(500), 'ok.bin')).status).toBe(201);

    await request(app).post('/api/premium/trial');
    expect((await request(app).post('/api/dialogs/1000/upload').attach('file', big, 'big.bin')).status).toBe(201);
    const huge = await request(app).post('/api/dialogs/1000/upload').attach('file', Buffer.alloc(9000), 'huge.bin');
    expect(huge.status).toBe(413);
    expect(huge.body.error.premiumLimitMb).toBeUndefined(); // already premium: nothing more to offer
  });

  it('when premium runs out the small limit applies again', async () => {
    clock = T0;
    const app = make();
    await login(app);
    await request(app).post('/api/premium/trial');
    const big = Buffer.alloc(3000);
    expect((await request(app).post('/api/dialogs/1000/upload').attach('file', big, 'a.bin')).status).toBe(201);
    clock = addMonths(T0, 3);
    expect((await request(app).post('/api/dialogs/1000/upload').attach('file', big, 'b.bin')).status).toBe(413);
  });
});

describe('create group / channel, calls', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(async () => {
    app = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
    await request(app).post('/api/auth/code').send({ code: MOCK_CODE });
  });

  it('creates a group with members and shows it in the list', async () => {
    const r = await request(app).post('/api/groups').send({ title: '  Yangi guruh  ', userIds: ['1000', '1001'] });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ kind: 'group', title: 'Yangi guruh' });
    const list = await request(app).get('/api/dialogs?limit=20');
    expect(list.body.items.some((d: { id: string }) => d.id === r.body.id)).toBe(true);
    expect((await request(app).post('/api/groups').send({ title: 'X', userIds: [] })).status).toBe(400);
    expect((await request(app).post('/api/groups').send({ title: '', userIds: ['1000'] })).status).toBe(400);
    expect((await request(app).post('/api/groups').send({ title: 'X', userIds: ['1021'] })).status).toBe(400); // a channel is not a person
  });

  it('creates a channel', async () => {
    const r = await request(app).post('/api/channels').send({ title: 'Mening kanalim', about: 'tavsif' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ kind: 'channel', title: 'Mening kanalim' });
    expect((await request(app).post('/api/channels').send({ title: 'x'.repeat(200) })).status).toBe(400);
  });

  it('lists calls (read only)', async () => {
    const r = await request(app).get('/api/calls');
    expect(r.body.items.length).toBeGreaterThan(2);
    expect(r.body.items[0]).toEqual(expect.objectContaining({ name: expect.any(String), date: expect.any(Number), out: expect.any(Boolean), missed: expect.any(Boolean) }));
  });

  it('all of it needs a login', async () => {
    const anon = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    expect((await request(anon).post('/api/groups').send({ title: 'X', userIds: ['1000'] })).status).toBe(401);
    expect((await request(anon).post('/api/channels').send({ title: 'X' })).status).toBe(401);
    expect((await request(anon).get('/api/calls')).status).toBe(401);
  });
});

describe('archive', () => {
  it('archives and unarchives a chat; archived chats stay flagged in the list', async () => {
    const app = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
    await request(app).post('/api/auth/code').send({ code: MOCK_CODE });
    const find = async () => (await request(app).get('/api/dialogs?limit=50')).body.items.find((d: { id: string }) => d.id === '1002');
    expect((await find()).archived).toBeUndefined();
    expect((await request(app).post('/api/dialogs/1002/archive').send({ archived: true })).status).toBe(200);
    expect((await find()).archived).toBe(true);
    expect((await request(app).post('/api/dialogs/1002/archive').send({ archived: false })).status).toBe(200);
    expect((await find()).archived).toBeUndefined();
    expect((await request(app).post('/api/dialogs/1002/archive').send({ archived: 'yes' })).status).toBe(400);
    const anon = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    expect((await request(anon).post('/api/dialogs/1002/archive').send({ archived: true })).status).toBe(401);
  });
});

describe('voice messages', () => {
  it('an uploaded audio file marked as voice becomes a voice note with its duration', async () => {
    const app = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
    await request(app).post('/api/auth/code').send({ code: MOCK_CODE });
    const r = await request(app).post('/api/dialogs/1000/upload').field('voice', '1').field('duration', '7').attach('file', Buffer.alloc(400), { filename: 'voice.ogg', contentType: 'audio/ogg' });
    expect(r.status).toBe(201);
    expect(r.body.media).toMatchObject({ kind: 'voice', duration: 7, mime: 'audio/ogg' });
    // not audio: the flag is ignored, never trusted
    const f = await request(app).post('/api/dialogs/1000/upload').field('voice', '1').attach('file', Buffer.alloc(50), { filename: 'x.txt', contentType: 'text/plain' });
    expect(f.body.media.kind).toBe('file');
    expect((await request(app).post('/api/dialogs/1000/upload').field('voice', '1').field('duration', '99999').attach('file', Buffer.alloc(50), { filename: 'v.ogg', contentType: 'audio/ogg' })).status).toBe(400);
  });
});

describe('round video messages', () => {
  it('a video marked as round becomes a round video note; the flag is ignored for other types', async () => {
    const app = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
    await request(app).post('/api/auth/code').send({ code: MOCK_CODE });
    const r = await request(app).post('/api/dialogs/1000/upload').field('round', '1').field('duration', '12').attach('file', Buffer.alloc(300), { filename: 'round.mp4', contentType: 'video/mp4' });
    expect(r.status).toBe(201);
    expect(r.body.media).toMatchObject({ kind: 'round', duration: 12, width: 384, height: 384 });
    const x = await request(app).post('/api/dialogs/1000/upload').field('round', '1').attach('file', Buffer.alloc(50), { filename: 'a.txt', contentType: 'text/plain' });
    expect(x.body.media.kind).toBe('file');
    const list = await request(app).get('/api/dialogs?limit=50');
    expect(list.body.items.find((d: { id: string }) => d.id === '1000').lastMessage.media).toBe('file'); // the last upload
  });
});
