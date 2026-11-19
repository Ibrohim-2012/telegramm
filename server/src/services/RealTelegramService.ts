import { TgError, type AuthState, type CallRecord, type Dialog, type Folder, type MediaBlob, type Me, type Message, type Profile, type TgEvent, type SharedKind, type UploadFile } from '../types.js';
import type { AdapterEvent, GramAdapter } from './GramAdapter.js';
import { limiter } from '../util.js';
import type { SessionStore } from './sessionStore.js';
import type { TelegramService } from './TelegramService.js';
import { isSessionDead, mapError } from './errors.js';

type Log = (msg: string, extra?: Record<string, unknown>) => void;

const DIALOG_TTL_MS = 20_000;
const MAX_DIALOGS = 300;
const MEDIA_CACHE_BYTES = 64 * 1024 * 1024;
const MEDIA_CACHE_ITEM = 8 * 1024 * 1024;

export class RealTelegramService implements TelegramService {
  readonly mode = 'real' as const;
  private state: AuthState = 'logged_out';
  private adapter: GramAdapter | null = null;
  private phone = '';
  private codeHash = '';
  private me: Me | null = null;
  private dialogCache: { at: number; items: Dialog[]; total: number } | null = null;
  private foldersCache: { at: number; items: Folder[] } | null = null;
  private handlers = new Set<(e: TgEvent) => void>();

  constructor(
    private readonly makeAdapter: (session: string) => GramAdapter,
    private readonly store: SessionStore,
    private readonly log: Log = () => {},
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((res) => setTimeout(res, ms)),
  ) {}

  private unsubscribe: (() => void) | null = null;
  private avatarCache = new Map<string, MediaBlob | null>();
  private readonly avatarSlots = limiter(3);
  private mediaCache = new Map<string, MediaBlob>();
  private mediaBytes = 0;

  private cacheMedia(key: string, blob: MediaBlob) {
    if (blob.data.length > MEDIA_CACHE_ITEM) return;
    this.mediaCache.set(key, blob);
    this.mediaBytes += blob.data.length;
    for (const [k, v] of this.mediaCache) {
      if (this.mediaBytes <= MEDIA_CACHE_BYTES) break;
      this.mediaCache.delete(k); // Map iterates oldest-first
      this.mediaBytes -= v.data.length;
    }
  }

  /** Restore a saved session on boot. Network errors keep the session so we can retry. */
  async init(): Promise<void> {
    const saved = await this.store.load();
    if (!saved) return;
    const adapter = this.makeAdapter(saved);
    try {
      await adapter.connect();
      if (await adapter.isAuthorized()) {
        this.adapter = adapter;
        this.state = 'ready';
        this.startEvents(adapter);
        this.log('session restored');
        return;
      }
      await this.dropSession(adapter, 'session not authorized');
    } catch (e) {
      const err = mapError(e);
      if (isSessionDead(err)) {
        await this.dropSession(adapter, err.code);
        return;
      }
      await adapter.disconnect().catch(() => {});
      throw err; // network etc.: caller retries with backoff
    }
  }

  getAuthState(): AuthState {
    return this.state;
  }

  async sendCode(phone: string): Promise<void> {
    try {
      if (!this.adapter) {
        this.adapter = this.makeAdapter('');
        await this.adapter.connect();
      }
      const { codeHash } = await this.adapter.sendCode(phone);
      this.phone = phone;
      this.codeHash = codeHash;
      this.state = 'code_sent';
      this.log('code sent');
    } catch (e) {
      throw mapError(e);
    }
  }

  async signIn(code: string): Promise<AuthState> {
    const a = this.adapter;
    if (this.state !== 'code_sent' || !a) throw new TgError('NO_CODE_REQUESTED', 'Avval kod so‘rang');
    try {
      const r = await a.signIn(this.phone, this.codeHash, code);
      if (r === 'password') {
        this.state = 'password_needed';
        return this.state;
      }
      return await this.finishLogin(a);
    } catch (e) {
      const err = mapError(e);
      if (err.code === 'PHONE_CODE_EXPIRED') this.state = 'logged_out';
      throw err;
    }
  }

  async checkPassword(password: string): Promise<AuthState> {
    const a = this.adapter;
    if (this.state !== 'password_needed' || !a) throw new TgError('NO_PASSWORD_REQUIRED', 'Parol talab qilinmaydi');
    try {
      await a.checkPassword(password);
      return await this.finishLogin(a);
    } catch (e) {
      throw mapError(e);
    }
  }

  async logout(): Promise<void> {
    const a = this.adapter;
    if (a) {
      try {
        await a.logOut();
      } catch (e) {
        // Still clear local state: the user must be able to leave even if Telegram is unreachable.
        this.log('remote logout failed', { code: mapError(e).code });
      }
      await a.disconnect().catch(() => {});
    }
    await this.store.clear();
    this.reset();
    this.log('logged out');
  }

  async getMe(): Promise<Me> {
    const a = this.requireReady();
    try {
      this.me ??= await a.me();
      return this.me;
    } catch (e) {
      throw await this.handleRpc(e);
    }
  }

  async getDialogs({ limit, offset }: { limit: number; offset: number }) {
    const a = this.requireReady();
    const now = Date.now();
    const want = Math.min(offset + limit, MAX_DIALOGS);
    const c = this.dialogCache;
    const enough = c && now - c.at <= DIALOG_TTL_MS && (c.items.length >= want || c.items.length >= c.total);
    if (!enough) {
      try {
        // Ask in blocks of 100 so scrolling through the list does not re-download it page by page.
        const { items, total } = await a.dialogs(Math.min(Math.ceil(want / 100) * 100, MAX_DIALOGS));
        this.dialogCache = { at: now, items, total };
      } catch (e) {
        throw await this.handleRpc(e);
      }
    }
    const { items, total } = this.dialogCache!;
    return { items: items.slice(offset, offset + limit), total: Math.min(total, MAX_DIALOGS) };
  }

  async createGroup(title: string, userIds: string[]): Promise<Dialog> {
    const d = await this.act((a) => a.createGroup(title, userIds));
    this.announceNew(d);
    return d;
  }

  async createChannel(title: string, about?: string): Promise<Dialog> {
    const d = await this.act((a) => a.createChannel(title, about));
    this.announceNew(d);
    return d;
  }

  private announceNew(d: Dialog) {
    this.upsertCached(d);
    this.dialogCache = this.dialogCache ? { ...this.dialogCache, total: this.dialogCache.total + 1 } : null;
    this.emit({ type: 'dialog:update', dialog: d });
  }

  getCalls(): Promise<CallRecord[]> {
    return this.act((a) => a.calls());
  }

  async getFolders(): Promise<Folder[]> {
    const a = this.requireReady();
    if (this.foldersCache && Date.now() - this.foldersCache.at < 60_000) return this.foldersCache.items;
    try {
      const items = await this.flood(() => a.folders());
      this.foldersCache = { at: Date.now(), items };
      return items;
    } catch (e) {
      throw await this.handleRpc(e);
    }
  }

  async getHistory(dialogId: string, opts: { limit: number; beforeId?: number }): Promise<{ items: Message[]; hasMore: boolean }> {
    const a = this.requireReady();
    try {
      return await this.flood(() => a.history(dialogId, opts.limit, opts.beforeId));
    } catch (e) {
      throw await this.handleRpc(e);
    }
  }

  async searchGlobal(query: string): Promise<Dialog[]> {
    const a = this.requireReady();
    const q = query.trim().replace(/^@/, '');
    if (q.length < 2) return [];
    try {
      return await a.searchGlobal(q);
    } catch (e) {
      throw await this.handleRpc(e);
    }
  }

  async getProfile(id: string): Promise<Profile> {
    const a = this.requireReady();
    try {
      return await a.profile(id);
    } catch (e) {
      throw await this.handleRpc(e);
    }
  }

  private async act<T>(fn: (a: GramAdapter) => Promise<T>): Promise<T> {
    const a = this.requireReady();
    try {
      return await this.flood(() => fn(a));
    } catch (e) {
      throw await this.handleRpc(e);
    }
  }

  sendMessage(dialogId: string, text: string, replyTo?: number): Promise<Message> {
    return this.act((a) => a.send(dialogId, text, replyTo));
  }

  editMessage(dialogId: string, id: number, text: string): Promise<Message> {
    return this.act((a) => a.edit(dialogId, id, text));
  }

  deleteMessages(dialogId: string, ids: number[], revoke: boolean): Promise<void> {
    return this.act((a) => a.remove(dialogId, ids, revoke));
  }

  forwardMessages(fromId: string, ids: number[], toId: string): Promise<Message[]> {
    return this.act((a) => a.forward(fromId, ids, toId));
  }

  sendMedia(dialogId: string, file: UploadFile, opts: { caption?: string; replyTo?: number; asFile: boolean; voice?: boolean; round?: boolean; duration?: number }): Promise<Message> {
    return this.act((a) => a.sendMedia(dialogId, file, opts));
  }

  async openMedia(dialogId: string, messageId: number, thumb: boolean): Promise<MediaBlob> {
    const key = `${dialogId}:${messageId}:${thumb ? 't' : 'f'}`;
    const hit = this.mediaCache.get(key);
    if (hit) return hit;
    const blob = await this.act((a) => a.openMedia(dialogId, messageId, thumb));
    this.cacheMedia(key, blob);
    return blob;
  }

  async getAvatar(id: string): Promise<MediaBlob | null> {
    if (this.avatarCache.has(id)) return this.avatarCache.get(id) ?? null;
    const blob = await this.avatarSlots(() => this.act((a) => a.avatar(id)));
    this.avatarCache.set(id, blob); // negative results are cached too
    if (this.avatarCache.size > 400) this.avatarCache.delete(this.avatarCache.keys().next().value as string);
    return blob;
  }

  react(dialogId: string, messageId: number, emoji: string | null): Promise<Message> {
    return this.act((a) => a.react(dialogId, messageId, emoji));
  }

  async setPinned(dialogId: string, pinned: boolean): Promise<void> {
    await this.act((a) => a.setPinned(dialogId, pinned));
    await this.refreshDialog(dialogId);
  }

  async setArchived(dialogId: string, archived: boolean): Promise<void> {
    await this.act((a) => a.setArchived(dialogId, archived));
    await this.refreshDialog(dialogId);
  }

  async setMuted(dialogId: string, muted: boolean): Promise<void> {
    await this.act((a) => a.setMuted(dialogId, muted));
    await this.refreshDialog(dialogId);
  }

  async getShared(dialogId: string, kind: SharedKind, opts: { limit: number; beforeId?: number }) {
    return this.act((a) => a.shared(dialogId, kind, opts.limit, opts.beforeId));
  }

  async searchMessages(dialogId: string, query: string, opts: { limit: number; beforeId?: number }) {
    if (!query.trim()) return { items: [], hasMore: false };
    return this.act((a) => a.searchMessages(dialogId, query.trim(), opts.limit, opts.beforeId));
  }

  /** Re-reads the top of the dialog list so pin/mute changes reach every open client. */
  private async refreshDialog(dialogId: string) {
    const a = this.adapter;
    if (!a) return;
    try {
      const { items: list, total } = await a.dialogs(Math.max(30, this.dialogCache?.items.length ?? 0));
      this.dialogCache = { at: Date.now(), items: list, total };
      const d = list.find((x) => x.id === dialogId);
      if (d) this.emit({ type: 'dialog:update', dialog: d });
    } catch (e) {
      this.log('dialog refresh failed', { code: mapError(e).code });
    }
  }

  async markRead(dialogId: string, maxId: number): Promise<void> {
    await this.act((a) => a.markRead(dialogId, maxId));
    const c = this.dialogCache?.items.find((x) => x.id === dialogId);
    if (!c) return;
    // Reading part of a chat leaves some unread: ask Telegram for the real number instead of guessing.
    const n = maxId === 0 ? 0 : await this.adapter?.unreadOf(dialogId).catch(() => undefined);
    const unread = n ?? c.unread;
    if (unread !== c.unread) {
      const d = { ...c, unread };
      this.upsertCached(d);
      this.emit({ type: 'dialog:update', dialog: d });
    }
  }

  setTyping(dialogId: string): Promise<void> {
    return this.act((a) => a.typing(dialogId));
  }

  onEvent(handler: (e: TgEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async dispose(): Promise<void> {
    this.unsubscribe?.();
    await this.adapter?.disconnect().catch(() => {});
    this.handlers.clear();
  }

  private async finishLogin(a: GramAdapter): Promise<AuthState> {
    await this.store.save(a.exportSession());
    this.state = 'ready';
    this.startEvents(a);
    this.dialogCache = null;
    this.log('login ok');
    return this.state;
  }

  private requireReady(): GramAdapter {
    if (this.state !== 'ready' || !this.adapter) throw new TgError('AUTH_KEY_UNREGISTERED', 'Tizimga kirilmagan');
    return this.adapter;
  }

  /** A session Telegram rejects sends the UI back to the login screen (the file is kept as .bak, never deleted). */
  private async handleRpc(e: unknown): Promise<TgError> {
    const err = mapError(e);
    if (isSessionDead(err)) {
      const a = this.adapter;
      await this.store.archive();
      await a?.disconnect().catch(() => {});
      this.reset();
      return new TgError('AUTH_KEY_UNREGISTERED', 'Sessiya tugagan, qayta kiring');
    }
    return err;
  }

  private async dropSession(a: GramAdapter, reason: string) {
    this.log('session dropped', { reason });
    await a.disconnect().catch(() => {});
    await this.store.archive();
    this.reset();
  }

  private startEvents(a: GramAdapter) {
    this.unsubscribe?.();
    this.unsubscribe = a.subscribe((e) => this.onAdapterEvent(a, e));
  }

  private onAdapterEvent(a: GramAdapter, e: AdapterEvent) {
    if (e.type === 'unread') {
      const cached = this.dialogCache?.items.find((x) => x.id === e.dialogId);
      if (cached) {
        const d: Dialog = { ...cached, unread: e.unread };
        this.upsertCached(d);
        this.emit({ type: 'dialog:update', dialog: d });
      } else {
        void this.refreshDialog(e.dialogId);
      }
      return;
    }
    this.emit(e);
    if (e.type === 'message:new') void this.bumpDialog(a, e.message);
  }

  private emit(e: TgEvent) {
    this.handlers.forEach((h) => h(e));
  }

  private upsertCached(d: Dialog) {
    const items = this.dialogCache?.items;
    if (!items) return;
    const i = items.findIndex((x) => x.id === d.id);
    if (i >= 0) items[i] = d;
    else items.push(d);
    items.sort((x, y) => Number(y.pinned) - Number(x.pinned) || (x.pinned && y.pinned ? (x.pinOrder ?? 0) - (y.pinOrder ?? 0) : 0) || (y.lastMessage?.date ?? 0) - (x.lastMessage?.date ?? 0));
  }

  /** Keep the dialog cache and sidebar in step with a new message. */
  private async bumpDialog(a: GramAdapter, m: Message) {
    const cached = this.dialogCache?.items.find((x) => x.id === m.dialogId);
    if (cached) {
      const d: Dialog = {
        ...cached,
        lastMessage: { text: m.text, date: m.date, out: m.out, read: m.read },
        unread: m.out ? cached.unread : cached.unread + 1,
      };
      this.upsertCached(d);
      this.emit({ type: 'dialog:update', dialog: d });
      return;
    }
    // Unknown chat (new conversation): refresh the head of the list once.
    try {
      const { items: list, total } = await a.dialogs(30);
      this.dialogCache = { at: Date.now(), items: list, total };
      const d = list.find((x) => x.id === m.dialogId);
      if (d) this.emit({ type: 'dialog:update', dialog: d });
    } catch (e) {
      this.log('dialog refresh failed', { code: mapError(e).code });
    }
  }

  /** Short FLOOD_WAITs are waited out once automatically; longer ones go to the UI. */
  private async flood<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const err = mapError(e);
      if (err.code === 'FLOOD_WAIT' && (err.retryAfter ?? 99) <= 15) {
        this.log('flood wait, backing off', { seconds: err.retryAfter });
        await this.sleep(((err.retryAfter ?? 1) + 1) * 1000);
        return fn();
      }
      throw e;
    }
  }

  private reset() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.mediaCache.clear();
    this.avatarCache.clear();
    this.foldersCache = null;
    this.mediaBytes = 0;
    this.adapter = null;
    this.state = 'logged_out';
    this.phone = '';
    this.codeHash = '';
    this.me = null;
    this.dialogCache = null;
  }
}
