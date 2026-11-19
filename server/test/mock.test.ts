import { describe, expect, it } from 'vitest';
import { MockTelegramService, MOCK_CODE, MOCK_PASSWORD } from '../src/services/MockTelegramService.js';
import { TgError, type TgEvent } from '../src/types.js';

const make = () => new MockTelegramService({ realtimeMs: 0 });

describe('MockTelegramService', () => {
  it('logs in with phone + code', async () => {
    const s = make();
    await s.sendCode('+998901234567');
    expect(s.getAuthState()).toBe('code_sent');
    expect(await s.signIn(MOCK_CODE)).toBe('ready');
  });

  it('rejects a wrong code', async () => {
    const s = make();
    await s.sendCode('+998901234567');
    await expect(s.signIn('00000')).rejects.toMatchObject({ code: 'PHONE_CODE_INVALID' });
  });

  it('requires 2FA for numbers ending in 0', async () => {
    const s = make();
    await s.sendCode('+998901234560');
    expect(await s.signIn(MOCK_CODE)).toBe('password_needed');
    await expect(s.checkPassword('nope')).rejects.toBeInstanceOf(TgError);
    expect(await s.checkPassword(MOCK_PASSWORD)).toBe('ready');
  });

  it('blocks dialogs before login and serves them after', async () => {
    const s = make();
    await expect(s.getDialogs({ limit: 10, offset: 0 })).rejects.toMatchObject({ code: 'AUTH_KEY_UNREGISTERED' });
    await s.sendCode('+998901234567');
    await s.signIn(MOCK_CODE);
    const page = await s.getDialogs({ limit: 10, offset: 0 });
    expect(page.items).toHaveLength(10);
    expect(page.total).toBeGreaterThan(100);
    const rest = await s.getDialogs({ limit: 200, offset: 10 });
    expect(new Set([...page.items, ...rest.items].map((d) => d.id)).size).toBe(page.total);
    expect(page.items[0]?.pinned).toBe(true);
  });

  it('logout resets state', async () => {
    const s = make();
    await s.sendCode('+998901234567');
    await s.signIn(MOCK_CODE);
    await s.logout();
    expect(s.getAuthState()).toBe('logged_out');
  });

  it('paginates history without gaps or duplicates', async () => {
    const s = make();
    await s.sendCode('+998901234567');
    await s.signIn(MOCK_CODE);
    const first = await s.getHistory('1000', { limit: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    const oldest = first.items[0]!.id;
    const second = await s.getHistory('1000', { limit: 20, beforeId: oldest });
    expect(second.items.at(-1)!.id).toBe(oldest - 1);
    const ids = [...second.items, ...first.items].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    const dates = [...second.items, ...first.items].map((m) => m.date);
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
    await expect(s.getHistory('nope', { limit: 5 })).rejects.toMatchObject({ code: 'PEER_ID_INVALID' });
  });

  it('global search by username and profile', async () => {
    const s = make();
    await s.sendCode('+998901234567');
    await s.signIn(MOCK_CODE);
    expect(await s.searchGlobal('a')).toEqual([]);
    const r = await s.searchGlobal('@alisher');
    expect(r[0]?.username).toBe('alisher_dev');
    const p = await s.getProfile(r[0]!.id);
    expect(p.username).toBe('alisher_dev');
    expect((await s.getProfile('1000')).title.length).toBeGreaterThan(0);
  });

  describe('messaging', () => {
    const ready = async () => {
      const s = make();
      await s.sendCode('+998901234567');
      await s.signIn(MOCK_CODE);
      const events: TgEvent[] = [];
      s.onEvent((e) => events.push(e));
      return { s, events };
    };

    it('sends a message, emits events, updates dialog', async () => {
      const { s, events } = await ready();
      const m = await s.sendMessage('1000', 'Salom **dunyo**');
      expect(m.out).toBe(true);
      expect(events.map((e) => e.type)).toEqual(['dialog:update', 'message:new']);
      const h = await s.getHistory('1000', { limit: 1 });
      expect(h.items[0]).toMatchObject({ id: m.id, text: 'Salom **dunyo**' });
      const d = (await s.getDialogs({ limit: 200, offset: 0 })).items.find((x) => x.id === '1000');
      expect(d?.lastMessage?.text).toBe('Salom **dunyo**');
    });

    it('replies, validates the target and refuses channels', async () => {
      const { s } = await ready();
      const base = await s.sendMessage('1000', 'asl');
      expect((await s.sendMessage('1000', 'javob', base.id)).replyToId).toBe(base.id);
      await expect(s.sendMessage('1000', 'x', 999_999)).rejects.toMatchObject({ code: 'MESSAGE_ID_INVALID' });
      await expect(s.sendMessage('1021', 'x')).rejects.toMatchObject({ code: 'CHAT_WRITE_FORBIDDEN' });
    });

    it('edits only own messages and flags edited', async () => {
      const { s, events } = await ready();
      const m = await s.sendMessage('1000', 'v1');
      const e = await s.editMessage('1000', m.id, 'v2');
      expect(e).toMatchObject({ text: 'v2', edited: true });
      expect(events.some((x) => x.type === 'message:edit')).toBe(true);
      await expect(s.editMessage('1000', m.id, 'v2')).rejects.toMatchObject({ code: 'MESSAGE_NOT_MODIFIED' });
      const first = (await s.getHistory('1000', { limit: 200 })).items.find((x) => !x.out)!;
      await expect(s.editMessage('1000', first.id, 'hack')).rejects.toMatchObject({ code: 'MESSAGE_AUTHOR_REQUIRED' });
    });

    it('deletes messages and emits delete event', async () => {
      const { s, events } = await ready();
      const m = await s.sendMessage('1000', 'bye');
      await s.deleteMessages('1000', [m.id], true);
      expect((await s.getHistory('1000', { limit: 5 })).items.some((x) => x.id === m.id)).toBe(false);
      expect(events).toContainEqual({ type: 'message:delete', dialogId: '1000', ids: [m.id] });
    });

    it('forwards with attribution and marks read clears unread', async () => {
      const { s } = await ready();
      const m = await s.sendMessage('1000', 'fwd me');
      const [f] = await s.forwardMessages('1000', [m.id], '1004');
      expect(f).toMatchObject({ dialogId: '1004', text: 'fwd me', fwdFrom: 'Siz' });
      const before = (await s.getDialogs({ limit: 200, offset: 0 })).items.find((x) => x.id === '1003')!;
      expect(before.unread).toBeGreaterThan(0);
      await s.markRead('1003', 0); // 0 = everything
      const after = (await s.getDialogs({ limit: 200, offset: 0 })).items.find((x) => x.id === '1003')!;
      expect(after.unread).toBe(0);
    });

    it('message ids stay unique and increasing across sends', async () => {
      const { s } = await ready();
      const a = await s.sendMessage('1000', 'a');
      const b = await s.sendMessage('1000', 'b');
      expect(b.id).toBe(a.id + 1);
    });

    it('requires login', async () => {
      await expect(make().sendMessage('1000', 'x')).rejects.toMatchObject({ code: 'AUTH_KEY_UNREGISTERED' });
    });
  });

  describe('media', () => {
    const ready = async () => {
      const s = make();
      await s.sendCode('+998901234567');
      await s.signIn(MOCK_CODE);
      return s;
    };

    it('history carries media of every mock kind and each opens', async () => {
      const s = await ready();
      const all = (await s.getHistory('1003', { limit: 100 })).items.filter((m) => m.media);
      const kinds = new Set(all.map((m) => m.media!.kind));
      expect([...kinds].sort()).toEqual(['file', 'photo', 'sticker', 'voice']);
      for (const m of all) {
        const blob = await s.openMedia('1003', m.id, false);
        expect(blob.data.length).toBeGreaterThan(0);
      }
      const wav = (await s.openMedia('1003', all.find((m) => m.media!.kind === 'voice')!.id, false)).data;
      expect(wav.subarray(0, 4).toString()).toBe('RIFF');
      expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
    });

    it('uploads become messages and can be downloaded back byte-for-byte', async () => {
      const s = await ready();
      const data = Buffer.from([1, 2, 3, 4, 5, 250]);
      const m = await s.sendMedia('1000', { name: 'a.png', mime: 'image/png', data }, { caption: 'sarlavha', asFile: false });
      expect(m).toMatchObject({ text: 'sarlavha', out: true, media: { kind: 'photo', name: 'a.png', size: 6 } });
      expect((await s.openMedia('1000', m.id, false)).data.equals(data)).toBe(true);
      const f = await s.sendMedia('1000', { name: 'b.png', mime: 'image/png', data }, { asFile: true });
      expect(f.media?.kind).toBe('file');
      const d = (await s.getDialogs({ limit: 200, offset: 0 })).items.find((x) => x.id === '1000');
      expect(d?.lastMessage).toMatchObject({ text: '', media: 'file' }); // the UI words it ("Fayl", "Photo"...)
    });

    it('rejects media on channels, missing media, bad reply', async () => {
      const s = await ready();
      const file = { name: 'x.txt', mime: 'text/plain', data: Buffer.from('x') };
      await expect(s.sendMedia('1021', file, { asFile: true })).rejects.toMatchObject({ code: 'CHAT_WRITE_FORBIDDEN' });
      await expect(s.sendMedia('1000', file, { asFile: true, replyTo: 99999 })).rejects.toMatchObject({ code: 'MESSAGE_ID_INVALID' });
      const plain = (await s.getHistory('1000', { limit: 5 })).items.find((m) => !m.media)!;
      await expect(s.openMedia('1000', plain.id, false)).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
    });

    it('forwarding keeps the media', async () => {
      const s = await ready();
      const m = (await s.getHistory('1003', { limit: 100 })).items.find((x) => x.media?.kind === 'photo')!;
      const [f] = await s.forwardMessages('1003', [m.id], '1004');
      expect(f?.media?.kind).toBe('photo');
      const orig = await s.openMedia('1003', m.id, false);
      expect((await s.openMedia('1004', f!.id, false)).data.equals(orig.data)).toBe(true);
    });
  });

  it('partial reads keep the messages after the read point unread', async () => {
    const s = make();
    await s.sendCode('+998901234567');
    await s.signIn(MOCK_CODE);
    const dlg = async () => (await s.getDialogs({ limit: 200, offset: 0 })).items.find((x) => x.id === '1003')!;
    const before = (await dlg()).unread;
    expect(before).toBeGreaterThan(0);
    const hist = (await s.getHistory('1003', { limit: 100 })).items;
    const lastId = hist.at(-1)!.id;
    const mid = hist.filter((m) => !m.out).at(-4)!.id; // three incoming messages after this one
    await s.markRead('1003', mid);
    expect((await dlg()).unread).toBe(Math.min(before, hist.filter((m) => !m.out && m.id > mid).length));
    await s.markRead('1003', lastId);
    expect((await dlg()).unread).toBe(0);
  });
});
