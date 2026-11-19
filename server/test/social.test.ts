import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { MockTelegramService, MOCK_CODE } from '../src/services/MockTelegramService.js';
import type { TgEvent } from '../src/types.js';

const ready = async () => {
  const s = new MockTelegramService({ realtimeMs: 0 });
  await s.sendCode('+998901234567');
  await s.signIn(MOCK_CODE);
  const events: TgEvent[] = [];
  s.onEvent((e) => events.push(e));
  return { s, events };
};

describe('reactions', () => {
  it('adds, switches and removes your reaction (one per user), emitting message:edit', async () => {
    const { s, events } = await ready();
    const m = await s.sendMessage('1000', 'reaksiya uchun');
    expect((await s.react('1000', m.id, '👍')).reactions).toEqual([{ emoji: '👍', count: 1, mine: true }]);
    expect((await s.react('1000', m.id, '❤️')).reactions).toEqual([{ emoji: '❤️', count: 1, mine: true }]); // switched, not stacked
    expect((await s.react('1000', m.id, '❤️')).reactions).toBeUndefined(); // same emoji again removes it
    expect((await s.react('1000', m.id, '🔥')).reactions?.[0]).toMatchObject({ emoji: '🔥', mine: true });
    expect((await s.react('1000', m.id, null)).reactions).toBeUndefined();
    expect(events.filter((e) => e.type === 'message:edit')).toHaveLength(5);
  });

  it('counts other people\'s reactions together with yours', async () => {
    const { s } = await ready();
    const seeded = (await s.getHistory('1003', { limit: 100 })).items.find((x) => x.reactions?.some((r) => r.emoji === '👍'))!;
    const before = seeded.reactions!.find((r) => r.emoji === '👍')!.count;
    const after = await s.react('1003', seeded.id, '👍');
    expect(after.reactions!.find((r) => r.emoji === '👍')).toMatchObject({ count: before + 1, mine: true });
  });

  it('rejects unknown messages', async () => {
    const { s } = await ready();
    await expect(s.react('1000', 999_999, '👍')).rejects.toMatchObject({ code: 'MESSAGE_ID_INVALID' });
  });
});

describe('pin and mute', () => {
  it('pins to the top and enforces the 5-chat limit', async () => {
    const { s, events } = await ready();
    await s.setPinned('1010', true);
    expect((await s.getDialogs({ limit: 10, offset: 0 })).items.slice(0, 6).some((d) => d.id === '1010')).toBe(true);
    expect(events.some((e) => e.type === 'dialog:update' && e.dialog.id === '1010' && e.dialog.pinned)).toBe(true);
    await s.setPinned('1011', true);
    await expect(s.setPinned('1012', true)).rejects.toMatchObject({ code: 'PINNED_DIALOGS_TOO_MUCH' });
    await s.setPinned('1010', false);
    await s.setPinned('1012', true); // room again
  });

  it('mutes and unmutes', async () => {
    const { s, events } = await ready();
    await s.setMuted('1005', true);
    expect((await s.getDialogs({ limit: 200, offset: 0 })).items.find((d) => d.id === '1005')?.muted).toBe(true);
    await s.setMuted('1005', false);
    expect((await s.getDialogs({ limit: 200, offset: 0 })).items.find((d) => d.id === '1005')?.muted).toBe(false);
    expect(events.filter((e) => e.type === 'dialog:update')).toHaveLength(2);
  });
});

describe('message search', () => {
  it('finds text case-insensitively, newest first, with paging', async () => {
    const { s } = await ready();
    for (const t of ['Salom A', 'boshqa', 'salom B', 'SALOM C']) await s.sendMessage('1000', t);
    const r = await s.searchMessages('1000', 'salom', { limit: 2 });
    expect(r.items.map((m) => m.text)).toEqual(['SALOM C', 'salom B']);
    expect(r.hasMore).toBe(true);
    const r2 = await s.searchMessages('1000', 'salom', { limit: 5, beforeId: r.items.at(-1)!.id });
    expect(r2.items[0]?.text).toBe('Salom A');
    expect((await s.searchMessages('1000', '   ', { limit: 5 })).items).toEqual([]);
    expect((await s.searchMessages('1000', 'yo\'q-bunday-matn-zzz', { limit: 5 })).items).toEqual([]);
  });
});

describe('endpoints', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(async () => {
    app = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
    await request(app).post('/api/auth/code').send({ code: '12345' });
  });

  it('reaction', async () => {
    const m = await request(app).post('/api/dialogs/1000/messages').send({ text: 'x' });
    const r = await request(app).post(`/api/dialogs/1000/messages/${m.body.id}/reaction`).send({ emoji: '🔥' });
    expect(r.body.reactions).toEqual([{ emoji: '🔥', count: 1, mine: true }]);
    const off = await request(app).post(`/api/dialogs/1000/messages/${m.body.id}/reaction`).send({ emoji: null });
    expect(off.body.reactions).toBeUndefined();
    expect((await request(app).post(`/api/dialogs/1000/messages/${m.body.id}/reaction`).send({ emoji: '' })).status).toBe(400);
    expect((await request(app).post('/api/dialogs/1000/messages/999999/reaction').send({ emoji: '👍' })).status).toBe(404);
  });

  it('pin, mute, search', async () => {
    expect((await request(app).post('/api/dialogs/1010/pin').send({ pinned: true })).body.ok).toBe(true);
    expect((await request(app).get('/api/dialogs?limit=10')).body.items.some((d: { id: string; pinned: boolean }) => d.id === '1010' && d.pinned)).toBe(true);
    expect((await request(app).post('/api/dialogs/1010/pin').send({ pinned: 'yes' })).status).toBe(400);
    expect((await request(app).post('/api/dialogs/1005/mute').send({ muted: true })).body.ok).toBe(true);
    await request(app).post('/api/dialogs/1000/messages').send({ text: 'maxsus-so\'z-123' });
    const s = await request(app).get('/api/dialogs/1000/search').query({ q: 'maxsus' });
    expect(s.body.items).toHaveLength(1);
    expect((await request(app).get('/api/dialogs/1000/search')).status).toBe(400);
  });

  it('are protected by login', async () => {
    const anon = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    expect((await request(anon).post('/api/dialogs/1000/pin').send({ pinned: true })).status).toBe(401);
    expect((await request(anon).get('/api/dialogs/1000/search').query({ q: 'a' })).status).toBe(401);
  });
});
