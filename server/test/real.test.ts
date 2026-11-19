import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdapterEvent, GramAdapter } from '../src/services/GramAdapter.js';
import { RealTelegramService } from '../src/services/RealTelegramService.js';
import { SessionStore } from '../src/services/sessionStore.js';
import { mapError } from '../src/services/errors.js';
import { TgError, type TgEvent } from '../src/types.js';

class Rpc extends Error {
  constructor(
    public errorMessage: string,
    public seconds?: number,
  ) {
    super(errorMessage);
  }
}

class FakeAdapter implements GramAdapter {
  static failNext: unknown = null;
  authorized = false;
  twoFa = false;
  loggedOut = false;
  calls: string[] = [];
  constructor(public session: string) {}
  private maybeFail() {
    const f = FakeAdapter.failNext;
    FakeAdapter.failNext = null;
    if (f) throw f;
  }
  async connect() {
    this.calls.push('connect');
    this.maybeFail();
  }
  async isAuthorized() {
    return this.session === 'good-session' || this.authorized;
  }
  async sendCode() {
    this.maybeFail();
    return { codeHash: 'hash1' };
  }
  async signIn(_p: string, hash: string, code: string) {
    this.maybeFail();
    if (hash !== 'hash1') throw new Rpc('PHONE_CODE_EXPIRED');
    if (code !== '11111') throw new Rpc('PHONE_CODE_INVALID');
    if (this.twoFa) return 'password' as const;
    this.authorized = true;
    return 'ok' as const;
  }
  async checkPassword(pw: string) {
    if (pw !== 'secret') throw new Rpc('PASSWORD_HASH_INVALID');
    this.authorized = true;
  }
  async me() {
    return { id: '1', firstName: 'Real', phone: '+998901234567' };
  }
  async dialogs(limit: number) {
    this.maybeFail();
    const items = Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
      id: String(i),
      kind: 'private' as const,
      title: `U${i}`,
      unread: 0,
      pinned: false,
      muted: false,
      online: false,
    }));
    return { items, total: 5 };
  }
  async folders() {
    return [{ id: 1, title: 'Ish', includeIds: ['1'], excludeIds: [] }];
  }
  async history(id: string, limit: number, beforeId?: number) {
    this.maybeFail();
    const ids = [5, 4, 3, 2, 1].filter((x) => beforeId === undefined || x < beforeId);
    return {
      items: ids.slice(0, limit).reverse().map((n) => ({ id: n, dialogId: id, text: `m${n}`, date: n, out: false, read: true })),
      hasMore: ids.length > limit,
    };
  }
  async searchGlobal(q: string) {
    return [{ id: '9', kind: 'private' as const, title: q, unread: 0, pinned: false, muted: false, online: false }];
  }
  async profile(id: string) {
    return { id, kind: 'private' as const, title: 'P' };
  }
  listeners = new Set<(e: AdapterEvent) => void>();
  floods = 0;
  sent: string[] = [];
  private flood() {
    if (this.floods > 0) {
      this.floods--;
      throw new Rpc('FLOOD_WAIT_2');
    }
  }
  async send(id: string, text: string, replyTo?: number) {
    this.maybeFail();
    this.flood();
    this.sent.push(text);
    return { id: 100, dialogId: id, text, date: 1, out: true, read: false, replyToId: replyTo };
  }
  async edit(id: string, mid: number, text: string) {
    return { id: mid, dialogId: id, text, date: 1, out: true, read: false, edited: true };
  }
  async remove() {}
  async forward(_f: string, ids: number[], to: string) {
    return ids.map((n) => ({ id: n + 1000, dialogId: to, text: 'f', date: 1, out: true, read: false }));
  }
  async markRead() {}
  async unreadOf() {
    return 0;
  }
  opened = 0;
  async sendMedia(id: string, f: { name: string }, o: { caption?: string }) {
    return { id: 300, dialogId: id, text: o.caption ?? '', date: 1, out: true, read: false, media: { kind: 'file' as const, name: f.name } };
  }
  async openMedia(_id: string, mid: number, thumb: boolean) {
    this.opened++;
    return { mime: 'image/jpeg', name: `m${mid}`, data: Buffer.from(thumb ? 'thumb' : 'full') };
  }
  async typing() {}
  subscribe(cb: (e: AdapterEvent) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  push(e: AdapterEvent) {
    this.listeners.forEach((l) => l(e));
  }
  exportSession() {
    return 'good-session';
  }
  async logOut() {
    this.loggedOut = true;
  }
  async disconnect() {
    this.calls.push('disconnect');
  }
}

let dir: string;
let store: SessionStore;
let last: FakeAdapter;
const make = (twoFa = false) =>
  new RealTelegramService((s) => {
    last = new FakeAdapter(s);
    last.twoFa = twoFa;
    return last;
  }, store);

beforeEach(async () => {
  FakeAdapter.failNext = null;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-'));
  store = new SessionStore(path.join(dir, 's.enc'), 'test-secret-test-secret-test-secret');
});

describe('SessionStore', () => {
  it('round-trips encrypted and never stores plaintext', async () => {
    await store.save('SECRET-SESSION-STRING');
    const raw = await fs.readFile(path.join(dir, 's.enc'), 'utf8');
    expect(raw).not.toContain('SECRET');
    expect(await store.load()).toBe('SECRET-SESSION-STRING');
  });
  it('returns null for wrong secret, missing file; clear removes', async () => {
    expect(await store.load()).toBeNull();
    await store.save('x');
    expect(await new SessionStore(path.join(dir, 's.enc'), 'other-secret').load()).toBeNull();
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});

describe('mapError', () => {
  it('maps flood, rpc, network, unknown', () => {
    expect(mapError(new Rpc('FLOOD_WAIT_42'))).toMatchObject({ code: 'FLOOD_WAIT', retryAfter: 42 });
    expect(mapError(new Rpc('FLOOD', 17))).toMatchObject({ code: 'FLOOD_WAIT', retryAfter: 17 });
    expect(mapError(new Rpc('PHONE_CODE_EXPIRED'))).toMatchObject({ code: 'PHONE_CODE_EXPIRED' });
    expect(mapError(new Error('getaddrinfo ENOTFOUND dc1'))).toMatchObject({ code: 'NETWORK' });
    expect(mapError(new Error('boom'))).toMatchObject({ code: 'UNKNOWN' });
    const t = new TgError('X', 'x');
    expect(mapError(t)).toBe(t);
  });
});

describe('RealTelegramService', () => {
  it('logs in with phone + code, persists session', async () => {
    const s = make();
    await s.sendCode('+998901234567');
    expect(s.getAuthState()).toBe('code_sent');
    expect(await s.signIn('11111')).toBe('ready');
    expect(await store.load()).toBe('good-session');
  });

  it('wrong code keeps state; expired code resets', async () => {
    const s = make();
    await s.sendCode('+998901234567');
    await expect(s.signIn('00000')).rejects.toMatchObject({ code: 'PHONE_CODE_INVALID' });
    expect(s.getAuthState()).toBe('code_sent');
    FakeAdapter.failNext = new Rpc('PHONE_CODE_EXPIRED');
    await expect(s.signIn('11111')).rejects.toMatchObject({ code: 'PHONE_CODE_EXPIRED' });
    expect(s.getAuthState()).toBe('logged_out');
  });

  it('handles 2FA: wrong then right password', async () => {
    const s = make(true);
    await s.sendCode('+998901234567');
    expect(await s.signIn('11111')).toBe('password_needed');
    await expect(s.checkPassword('bad')).rejects.toMatchObject({ code: 'PASSWORD_HASH_INVALID' });
    expect(await s.checkPassword('secret')).toBe('ready');
  });

  it('surfaces FLOOD_WAIT with retryAfter', async () => {
    const s = make();
    FakeAdapter.failNext = new Rpc('FLOOD_WAIT_300');
    await expect(s.sendCode('+998901234567')).rejects.toMatchObject({ code: 'FLOOD_WAIT', retryAfter: 300 });
    expect(s.getAuthState()).toBe('logged_out');
  });

  it('restores a saved session on init', async () => {
    await store.save('good-session');
    const s = make();
    await s.init();
    expect(s.getAuthState()).toBe('ready');
    expect((await s.getMe()).firstName).toBe('Real');
  });

  it('drops a revoked session on init', async () => {
    await store.save('good-session');
    FakeAdapter.failNext = new Rpc('SESSION_REVOKED');
    const s = make();
    await s.init();
    expect(s.getAuthState()).toBe('logged_out');
    expect(await store.load()).toBeNull();
  });

  it('keeps the session on network failure during init', async () => {
    await store.save('good-session');
    FakeAdapter.failNext = new Error('ETIMEDOUT');
    const s = make();
    await expect(s.init()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(await store.load()).toBe('good-session');
  });

  it('revoked session during use returns to logged out', async () => {
    await store.save('good-session');
    const s = make();
    await s.init();
    FakeAdapter.failNext = new Rpc('AUTH_KEY_UNREGISTERED');
    await expect(s.getDialogs({ limit: 3, offset: 0 })).rejects.toMatchObject({ code: 'AUTH_KEY_UNREGISTERED' });
    expect(s.getAuthState()).toBe('logged_out');
    expect(await store.load()).toBeNull();
  });

  it('caches dialogs and paginates', async () => {
    await store.save('good-session');
    const s = make();
    await s.init();
    const a = await s.getDialogs({ limit: 4, offset: 0 });
    expect(a.items).toHaveLength(4);
    FakeAdapter.failNext = new Error('would fail if refetched');
    const b = await s.getDialogs({ limit: 2, offset: 2 }); // served from cache
    expect(b.items).toHaveLength(2);
  });

  it('logout clears session and calls Telegram', async () => {
    const s = make();
    await s.sendCode('+998901234567');
    await s.signIn('11111');
    const a = last;
    await s.logout();
    expect(a.loggedOut).toBe(true);
    expect(s.getAuthState()).toBe('logged_out');
    expect(await store.load()).toBeNull();
    await expect(s.getMe()).rejects.toMatchObject({ code: 'AUTH_KEY_UNREGISTERED' });
  });

  it('history, search and profile pass through; short queries skip the network', async () => {
    await store.save('good-session');
    const s = make();
    await s.init();
    const h = await s.getHistory('1', { limit: 2 });
    expect(h.items.map((m) => m.id)).toEqual([4, 5]);
    expect(h.hasMore).toBe(true);
    expect((await s.getHistory('1', { limit: 5, beforeId: 3 })).items.map((m) => m.id)).toEqual([1, 2]);
    expect(await s.searchGlobal('a')).toEqual([]);
    expect((await s.searchGlobal('@ali'))[0]?.title).toBe('ali');
    expect((await s.getProfile('7')).id).toBe('7');
  });

  describe('messaging', () => {
    const ready = async (sleep: (ms: number) => Promise<void> = async () => {}) => {
      await store.save('good-session');
      const s = new RealTelegramService(
        (sess) => {
          last = new FakeAdapter(sess);
          return last;
        },
        store,
        () => {},
        sleep,
      );
      await s.init();
      const events: TgEvent[] = [];
      s.onEvent((e) => events.push(e));
      return { s, events };
    };

    it('send, edit, forward pass through', async () => {
      const { s } = await ready();
      expect((await s.sendMessage('1', 'hi', 5)).replyToId).toBe(5);
      expect((await s.editMessage('1', 7, 'x')).edited).toBe(true);
      expect((await s.forwardMessages('1', [3], '2'))[0]?.dialogId).toBe('2');
    });

    it('retries once after a short FLOOD_WAIT, then gives up on a second one', async () => {
      const waits: number[] = [];
      const { s } = await ready(async (ms) => void waits.push(ms));
      last.floods = 1;
      await s.sendMessage('1', 'a');
      expect(waits).toEqual([3000]);
      expect(last.sent).toEqual(['a']);
      last.floods = 2;
      await expect(s.sendMessage('1', 'b')).rejects.toMatchObject({ code: 'FLOOD_WAIT' });
    });

    it('does not auto-wait for long flood waits', async () => {
      const { s } = await ready();
      FakeAdapter.failNext = new Rpc('FLOOD_WAIT_900');
      await expect(s.sendMessage('1', 'x')).rejects.toMatchObject({ code: 'FLOOD_WAIT', retryAfter: 900 });
    });

    it('forwards telegram updates as events and bumps the dialog', async () => {
      const { s, events } = await ready();
      await s.getDialogs({ limit: 5, offset: 0 }); // fills cache (ids 0..4)
      last.push({ type: 'message:new', message: { id: 9, dialogId: '2', text: 'yangi', date: 50, out: false, read: true } });
      last.push({ type: 'typing', dialogId: '2', typing: true });
      last.push({ type: 'read', dialogId: '2', maxId: 9 });
      await new Promise((r) => setTimeout(r, 0));
      expect(events.map((e) => e.type)).toEqual(['message:new', 'dialog:update', 'typing', 'read']);
      const upd = events.find((e) => e.type === 'dialog:update');
      expect(upd && upd.type === 'dialog:update' && upd.dialog).toMatchObject({ id: '2', unread: 1 });
      expect(upd && upd.type === 'dialog:update' && upd.dialog.lastMessage?.text).toBe('yangi');
    });

    it('a chat read on another device (phone) updates the unread counter here', async () => {
      const { s, events } = await ready();
      await s.getDialogs({ limit: 5, offset: 0 });
      last.push({ type: 'message:new', message: { id: 9, dialogId: '2', text: 'yangi', date: 50, out: false, read: true } });
      last.push({ type: 'unread', dialogId: '2', unread: 0 }); // Telegram: you read it on your phone
      await new Promise((r) => setTimeout(r, 0));
      const updates = events.filter((e) => e.type === 'dialog:update');
      const lastUpd = updates.at(-1);
      expect(lastUpd && lastUpd.type === 'dialog:update' && lastUpd.dialog).toMatchObject({ id: '2', unread: 0 });
      const list = await s.getDialogs({ limit: 5, offset: 0 });
      expect(list.items.find((d) => d.id === '2')?.unread).toBe(0); // the cache follows too, not just the event
    });

    it('stops listening after logout', async () => {
      const { s, events } = await ready();
      const a = last;
      await s.logout();
      a.push({ type: 'typing', dialogId: '1', typing: true });
      expect(events).toHaveLength(0);
    });
  });

  describe('media', () => {
    const ready = async () => {
      await store.save('good-session');
      const s = new RealTelegramService((sess) => ((last = new FakeAdapter(sess)), last), store);
      await s.init();
      return s;
    };

    it('uploads through the adapter', async () => {
      const s = await ready();
      const m = await s.sendMedia('1', { name: 'a.pdf', mime: 'application/pdf', data: Buffer.from('x') }, { caption: 'c', asFile: true });
      expect(m).toMatchObject({ text: 'c', media: { name: 'a.pdf' } });
    });

    it('caches downloaded media per message and variant', async () => {
      const s = await ready();
      expect((await s.openMedia('1', 5, false)).data.toString()).toBe('full');
      await s.openMedia('1', 5, false);
      expect(last.opened).toBe(1);
      expect((await s.openMedia('1', 5, true)).data.toString()).toBe('thumb');
      expect(last.opened).toBe(2);
    });

    it('maps expired session during download to logged out', async () => {
      const s = await ready();
      FakeAdapter.failNext = new Rpc('AUTH_KEY_UNREGISTERED');
      last.openMedia = async () => {
        throw new Rpc('AUTH_KEY_UNREGISTERED');
      };
      await expect(s.openMedia('1', 77, false)).rejects.toMatchObject({ code: 'AUTH_KEY_UNREGISTERED' });
      expect(s.getAuthState()).toBe('logged_out');
    });
  });
});
