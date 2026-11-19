import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { GramAdapter } from '../src/services/GramAdapter.js';
import { serviceKind } from '../src/services/GramJsAdapter.js';
import { MockTelegramService, MOCK_CODE } from '../src/services/MockTelegramService.js';
import { RealTelegramService } from '../src/services/RealTelegramService.js';
import { SessionStore } from '../src/services/sessionStore.js';
import type { Dialog, Folder } from '../src/types.js';

const dlg = (i: number, extra: Partial<Dialog> = {}): Dialog => ({ id: String(i), kind: 'private', title: `C${i}`, unread: 0, pinned: false, muted: false, online: false, ...extra });

/** A fake Telegram account with `total` chats; counts how often the dialog list is downloaded. */
function fake(total: number, folders: Folder[] = []) {
  const calls = { dialogs: [] as number[], folders: 0 };
  const adapter = {
    connect: async () => {},
    isAuthorized: async () => true,
    dialogs: async (limit: number) => {
      calls.dialogs.push(limit);
      return { items: Array.from({ length: Math.min(limit, total) }, (_, i) => dlg(i, i < 3 ? { pinned: true, pinOrder: i } : {})), total };
    },
    folders: async () => (calls.folders++, folders),
    subscribe: () => () => {},
    disconnect: async () => {},
    exportSession: () => 's',
  } as unknown as GramAdapter;
  return { adapter, calls };
}

async function ready(adapter: GramAdapter) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-'));
  const store = new SessionStore(path.join(dir, 's.enc'), 'secret-secret-secret-secret-secret');
  await store.save('good');
  const svc = new RealTelegramService(() => adapter, store, () => {}, async () => {});
  await svc.init();
  return svc;
}

describe('real dialog list: paging against a big account', () => {
  it('reports the real total so infinite scroll keeps going', async () => {
    const { adapter } = fake(250);
    const svc = await ready(adapter);
    const first = await svc.getDialogs({ limit: 40, offset: 0 });
    expect(first.items).toHaveLength(40);
    expect(first.total).toBe(250); // used to equal the number fetched, which stopped the scrolling after one page
  });

  it('downloads in blocks of 100 and serves the next pages from cache', async () => {
    const { adapter, calls } = fake(250);
    const svc = await ready(adapter);
    await svc.getDialogs({ limit: 40, offset: 0 });
    await svc.getDialogs({ limit: 40, offset: 40 });
    await svc.getDialogs({ limit: 40, offset: 80 }); // 80..120 crosses the first block
    expect(calls.dialogs).toEqual([100, 200]);
    const last = await svc.getDialogs({ limit: 40, offset: 200 });
    expect(last.items).toHaveLength(40);
  });

  it('stops asking once everything has been loaded', async () => {
    const { adapter, calls } = fake(30);
    const svc = await ready(adapter);
    const r = await svc.getDialogs({ limit: 40, offset: 0 });
    expect(r).toMatchObject({ total: 30 });
    expect(r.items).toHaveLength(30);
    await svc.getDialogs({ limit: 40, offset: 40 });
    expect(calls.dialogs).toHaveLength(1);
  });

  it('keeps Telegram\'s own order for pinned chats', async () => {
    const { adapter } = fake(10);
    const svc = await ready(adapter);
    const { items } = await svc.getDialogs({ limit: 10, offset: 0 });
    expect(items.slice(0, 3).map((d) => d.pinOrder)).toEqual([0, 1, 2]);
  });
});

describe('chat folders', () => {
  const folders: Folder[] = [
    { id: 2, title: 'Ish', includeIds: ['1'], excludeIds: [], groups: true },
    { id: 3, title: 'Oila', includeIds: [], excludeIds: ['9'], contacts: true, excludeMuted: true },
  ];

  it('real service passes folders through and caches them', async () => {
    const { adapter, calls } = fake(5, folders);
    const svc = await ready(adapter);
    expect(await svc.getFolders()).toEqual(folders);
    await svc.getFolders();
    expect(calls.folders).toBe(1);
  });

  it('GET /api/folders (mock with folders, mock without)', async () => {
    const withFolders = createApp(new MockTelegramService({ realtimeMs: 0, folders }), 'http://localhost:3000');
    const without = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    for (const app of [withFolders, without]) {
      await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
      await request(app).post('/api/auth/code').send({ code: MOCK_CODE });
    }
    expect((await request(withFolders).get('/api/folders')).body.items).toEqual(folders);
    expect((await request(without).get('/api/folders')).body.items).toEqual([]);
    const anon = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    expect((await request(anon).get('/api/folders')).status).toBe(401);
  });
});

describe('service messages', () => {
  it('maps Telegram actions to kinds the UI can word', () => {
    const k = (className: string) => serviceKind({ className });
    expect(k('MessageActionChatAddUser')).toBe('joined');
    expect(k('MessageActionChatJoinedByLink')).toBe('joined');
    expect(k('MessageActionChatDeleteUser')).toBe('left');
    expect(k('MessageActionChannelCreate')).toBe('created');
    expect(k('MessageActionPinMessage')).toBe('pinned');
    expect(k('MessageActionChatEditTitle')).toBe('title');
    expect(k('MessageActionChatEditPhoto')).toBe('photo');
    expect(k('MessageActionPhoneCall')).toBe('call');
    expect(k('MessageActionTopicCreate')).toBe('topic');
    expect(k('MessageActionSomethingNew')).toBe('other');
    expect(serviceKind(undefined)).toBe('other');
  });
});
