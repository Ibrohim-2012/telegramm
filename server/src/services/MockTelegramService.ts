import { TgError, type AuthState, type CallRecord, type Dialog, type Folder, type MediaBlob, type MediaInfo, type Me, type Message, type Profile, type TgEvent, type SharedKind, type UploadFile } from '../types.js';
import { avatarSvg, mockBlob, mockMediaFor } from './mockMedia.js';
import type { TelegramService } from './TelegramService.js';

export const MOCK_CODE = '12345';
export const MOCK_PASSWORD = 'mock2fa';

const PEOPLE = [
  'Aziza Karimova', 'Bobur Yusupov', 'Dilnoza Rahimova', 'Jasur Aliyev', 'Malika Tursunova',
  'Sardor Nazarov', 'Nodira Ergasheva', 'Otabek Qodirov', 'Shahnoza Mirzayeva', 'Timur Saidov',
  'Zilola Abdullayeva', 'Farrux Hamidov', 'Madina Ismoilova', 'Eldor Sobirov', 'Gulnora Xolmatova',
];
const GROUPS = ['Oila 👨‍👩‍👧', 'Dasturchilar Toshkent', 'Futbol — dam olish kuni', 'Universitet 2-kurs', 'Ish jamoasi'];
const CHANNELS = ['Kun.uz yangiliklari', 'Texnologiya olami', 'Kitob o‘qish klubi', 'Ingliz tili kundalik'];
const SNIPPETS = [
  'Assalomu alaykum! Ishlar qalay?', 'Ertaga uchrashamizmi?', 'Rahmat, juda yordam berdingiz 🙏',
  'Fayllarni yubordim, ko‘rib chiqing', 'Soat nechada boshlanadi?', 'Hozir band, keyinroq yozaman',
  'Zo‘r g‘oya! 🔥', 'Bugun yangi versiya chiqdi', 'Ovozli xabar', 'Xo‘p, kelishdik 👍',
];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length] as T;
}

function buildDialogs(now: number): Dialog[] {
  const out: Dialog[] = [];
  let n = 0;
  const push = (kind: Dialog['kind'], title: string) => {
    const i = n++;
    const unread = i % 3 === 0 ? (i * 7) % 23 : 0;
    out.push({
      id: String(1000 + i),
      kind,
      title,
      username: kind === 'private' ? title.split(' ')[0]!.toLowerCase() + (i + 10) : undefined,
      lastMessage: {
        text: pick(SNIPPETS, i * 3 + 1),
        date: now - i * 1700 - 60,
        out: i % 4 === 1,
        read: i % 4 !== 1 || i % 8 === 1,
      },
      unread,
      pinned: i < 2,
      muted: kind !== 'private' && i % 2 === 0,
      online: kind === 'private' && i % 3 === 1,
      photo: i % 4 === 0,
    });
  };
  PEOPLE.forEach((p) => push('private', p));
  GROUPS.forEach((g) => push('group', g));
  CHANNELS.forEach((c) => push('channel', c));
  // Extra contacts so pagination / virtualization have something to chew on.
  for (let k = 1; k <= 110; k++) push('private', `${pick(PEOPLE, k * 3).split(' ')[0]} ${k}`);
  out.push({
    id: '1',
    kind: 'private',
    title: 'Saqlangan xabarlar',
    lastMessage: { text: 'Eslatma: ertaga hisobot', date: now - 300, out: true, read: true },
    unread: 0,
    pinned: true,
    muted: false,
    online: false,
    photo: true,
  });
  // interleave so the list shows a mix of kinds
  return out.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastMessage?.date ?? 0) - (a.lastMessage?.date ?? 0));
}

const POOL = [
  'alisher_dev', 'barno.design', 'chingiz_k', 'dildora_uz', 'eldor_tech', 'feruza_', 'gayrat77', 'hilola_m',
  'ilhom_pro', 'jahongir_x', 'kamola_art', 'laziz_bek', 'munisa_', 'nodir_ios', 'oybek_js',
];

function poolDialog(i: number): Dialog {
  const u = POOL[i] as string;
  return {
    id: String(5000 + i),
    kind: 'private',
    title: u.replace(/[._\d]+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()) || u,
    username: u,
    unread: 0,
    pinned: false,
    muted: false,
    online: i % 4 === 0,
    photo: i % 2 === 0,
  };
}

/** Deterministic fake history for a dialog (ids 1..n, newest last). */
function buildHistory(d: Dialog): Message[] {
  const seed = Number(d.id) % 97;
  const n = 45 + (seed % 7) * 25;
  const end = d.lastMessage?.date ?? Math.floor(Date.now() / 1000);
  const out: Message[] = [];
  // Cumulative gaps walking back from the newest message keep dates monotonic in id.
  const dates: number[] = [];
  for (let id = n, t = end; id >= 1; id--) {
    dates[id] = t;
    t -= id % 5 === 0 ? 14_400 : 540;
  }
  for (let id = 1; id <= n; id++) {
    const last = id === n && d.lastMessage;
    const media = last ? undefined : mockMediaFor(id);
    out.push({
      media,
      reactions: !last && id % 7 === 0 ? [{ emoji: '👍', count: 2, mine: false }, { emoji: '❤️', count: 1, mine: false }] : undefined,
      id,
      dialogId: d.id,
      text: last
        ? d.lastMessage!.text
        : media
          ? media.kind === 'photo' && id % 2 === 1
            ? 'Mana **rasm**!'
            : ''
        : id % 11 === 0
          ? '**Muhim:** ertaga `09:00` da yig‘ilish, reja: https://example.com/reja __(kechikmang)__'
          : `${pick(SNIPPETS, id * 5 + seed)}${id % 9 === 0 ? ' Bu uzunroq xabar: ertaga ertalab soat 9 da yig‘ilish bor, kechikmang.' : ''}`,
      date: dates[id] as number,
      out: d.id === '1' ? true : last ? d.lastMessage!.out : (id * 7 + seed) % 3 === 0,
      read: true,
      senderName: d.kind === 'group' ? pick(PEOPLE, id + seed) : undefined,
    });
  }
  return out;
}

export class MockTelegramService implements TelegramService {
  readonly mode = 'mock' as const;
  private state: AuthState = 'logged_out';
  private phone = '';
  private needs2fa = false;
  private dialogs = buildDialogs(Math.floor(Date.now() / 1000));
  private handlers = new Set<(e: TgEvent) => void>();
  private timer: NodeJS.Timeout | undefined;
  private timeouts = new Set<NodeJS.Timeout>();
  private threads = new Map<string, Message[]>();
  private uploads = new Map<string, MediaBlob>();

  constructor(private readonly opts: { realtimeMs?: number; folders?: Folder[]; slot?: number } = {}) {}

  async createGroup(title: string, userIds: string[]): Promise<Dialog> {
    this.requireReady();
    for (const id of userIds) if (this.peer(id).kind !== 'private') throw new TgError('BAD_INPUT', 'Guruhga faqat foydalanuvchilarni qo‘shish mumkin');
    return this.addDialog('group', title);
  }

  async createChannel(title: string): Promise<Dialog> {
    this.requireReady();
    return this.addDialog('channel', title);
  }

  private addDialog(kind: Dialog['kind'], title: string): Dialog {
    // Like Telegram: a new chat starts with a "created" service line, which also puts it on top of the list.
    const d: Dialog = { id: String(3000 + this.dialogs.length), kind, title, unread: 0, pinned: false, muted: false, online: false, photo: false, lastMessage: { text: '', date: Math.floor(Date.now() / 1000), out: true, read: true, service: 'created' } };
    this.dialogs.push(d);
    this.threads.set(d.id, []);
    this.dialogs.sort((x, y) => Number(y.pinned) - Number(x.pinned) || (y.lastMessage?.date ?? 0) - (x.lastMessage?.date ?? 0));
    this.emit({ type: 'dialog:update', dialog: { ...d } });
    return { ...d };
  }

  async getCalls(): Promise<CallRecord[]> {
    this.requireReady();
    const now = Math.floor(Date.now() / 1000);
    return this.dialogs
      .filter((d) => d.kind === 'private' && d.id !== '1')
      .slice(0, 6)
      .map((d, i) => ({ id: i + 1, userId: d.id, name: d.title, date: now - i * 7200 - 600, out: i % 2 === 0, missed: i % 3 === 2, video: i % 4 === 1, duration: i % 3 === 2 ? 0 : 35 + i * 47 }));
  }

  async getFolders(): Promise<Folder[]> {
    this.requireReady();
    return this.opts.folders ?? [];
  }

  getAuthState(): AuthState {
    return this.state;
  }

  async sendCode(phone: string): Promise<void> {
    this.phone = phone;
    // Numbers ending in 0 simulate an account with a cloud password.
    this.needs2fa = phone.endsWith('0');
    this.state = 'code_sent';
  }

  async signIn(code: string): Promise<AuthState> {
    if (this.state !== 'code_sent') throw new TgError('NO_CODE_REQUESTED', 'Avval kod so‘rang');
    if (code !== MOCK_CODE) throw new TgError('PHONE_CODE_INVALID', 'Kod noto‘g‘ri');
    this.state = this.needs2fa ? 'password_needed' : this.becomeReady();
    return this.state;
  }

  async checkPassword(password: string): Promise<AuthState> {
    if (this.state !== 'password_needed') throw new TgError('NO_PASSWORD_REQUIRED', 'Parol talab qilinmaydi');
    if (password !== MOCK_PASSWORD) throw new TgError('PASSWORD_HASH_INVALID', 'Parol noto‘g‘ri');
    this.state = this.becomeReady();
    return this.state;
  }

  async logout(): Promise<void> {
    this.stopRealtime();
    this.state = 'logged_out';
    this.phone = '';
  }

  async getMe(): Promise<Me> {
    this.requireReady();
    const n = (this.opts.slot ?? 0) + 1; // second and third accounts get their own name
    return { id: '1', firstName: 'Sinov', lastName: n > 1 ? `Foydalanuvchi ${n}` : 'Foydalanuvchi', username: n > 1 ? `sinov_user${n}` : 'sinov_user', phone: this.phone };
  }

  async getDialogs({ limit, offset }: { limit: number; offset: number }) {
    this.requireReady();
    return { items: this.dialogs.slice(offset, offset + limit), total: this.dialogs.length };
  }

  async getHistory(dialogId: string, { limit, beforeId }: { limit: number; beforeId?: number }) {
    this.requireReady();
    const all = this.thread(this.peer(dialogId)).filter((x) => beforeId === undefined || x.id < beforeId);
    return { items: all.slice(-limit), hasMore: all.length > limit };
  }

  async searchGlobal(query: string) {
    this.requireReady();
    const q = query.trim().replace(/^@/, '').toLowerCase();
    if (q.length < 2) return [];
    return POOL.map((_, i) => poolDialog(i))
      .filter((d) => d.username!.includes(q) || d.title.toLowerCase().includes(q))
      .slice(0, 10);
  }

  async getProfile(id: string): Promise<Profile> {
    this.requireReady();
    const d = this.dialogs.find((x) => x.id === id) ?? this.poolFind(id);
    if (!d) throw new TgError('PEER_ID_INVALID', 'Chat topilmadi');
    return {
      id: d.id,
      kind: d.kind,
      title: d.title,
      username: d.username,
      phone: d.kind === 'private' ? `+99890${d.id.padStart(7, '0').slice(-7)}` : undefined,
      bio: d.kind === 'private' ? 'Toshkent · dasturchi · kofe ☕' : 'Rasmiy guruh. Qoidalarga rioya qiling.',
      online: d.online,
      lastSeen: d.online ? undefined : Math.floor(Date.now() / 1000) - 5400,
      members: d.kind === 'private' ? undefined : 120 + (Number(d.id) % 50) * 37,
    };
  }

  private peer(id: string): Dialog {
    const d = this.dialogs.find((x) => x.id === id) ?? this.poolFind(id);
    if (!d) throw new TgError('PEER_ID_INVALID', 'Chat topilmadi');
    return d;
  }

  private thread(d: Dialog): Message[] {
    let t = this.threads.get(d.id);
    if (!t) {
      t = buildHistory(d);
      this.threads.set(d.id, t);
    }
    return t;
  }

  private append(d: Dialog, m: Omit<Message, 'id' | 'dialogId'>): Message {
    const t = this.thread(d);
    const id = (t.at(-1)?.id ?? 0) + 1;
    const msg: Message = { ...m, id, dialogId: d.id };
    t.push(msg);
    // A chat found through global search joins the list once we write to it.
    if (!this.dialogs.includes(d)) this.dialogs.push(d);
    this.refreshDialog(d);
    return msg;
  }

  private refreshDialog(d: Dialog) {
    const last = this.thread(d).at(-1);
    d.lastMessage = last ? { text: last.text, date: last.date, out: last.out, read: last.read, media: last.media?.kind, sender: !last.out && d.kind === 'group' ? last.senderName?.split(' ')[0] : undefined } : undefined;
    this.dialogs.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastMessage?.date ?? 0) - (a.lastMessage?.date ?? 0));
    this.emit({ type: 'dialog:update', dialog: { ...d } });
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timeouts.delete(t);
      fn();
    }, ms);
    t.unref();
    this.timeouts.add(t);
  }

  async sendMessage(dialogId: string, text: string, replyTo?: number): Promise<Message> {
    this.requireReady();
    const d = this.peer(dialogId);
    if (d.kind === 'channel') throw new TgError('CHAT_WRITE_FORBIDDEN', 'Kanalga yozib bo‘lmaydi');
    if (replyTo !== undefined && !this.thread(d).some((x) => x.id === replyTo)) throw new TgError('MESSAGE_ID_INVALID', 'Xabar topilmadi');
    const msg = this.append(d, { text, date: Math.floor(Date.now() / 1000), out: true, read: false, replyToId: replyTo });
    this.emit({ type: 'message:new', message: msg });
    this.simulatePeer(d, msg.id, text);
    return { ...msg };
  }

  private simulatePeer(d: Dialog, id: number, text: string) {
    const msg = { id };
    if ((this.opts.realtimeMs ?? 12000) > 0 && d.kind === 'private' && d.id !== '1') {
      // Simulated peer: reads the message, starts typing, then answers.
      this.later(1200, () => {
        this.markOutRead(d, msg.id);
        this.emit({ type: 'typing', dialogId: d.id, name: d.title, typing: true });
      });
      this.later(3200, () => {
        this.emit({ type: 'typing', dialogId: d.id, name: d.title, typing: false });
        this.incoming(d, `Xabaringiz uchun rahmat! 🙂 (${text.slice(0, 40)})`);
      });
    }
  }

  async sendMedia(dialogId: string, file: UploadFile, opts: { caption?: string; replyTo?: number; asFile: boolean; voice?: boolean; round?: boolean; duration?: number }): Promise<Message> {
    this.requireReady();
    const d = this.peer(dialogId);
    if (d.kind === 'channel') throw new TgError('CHAT_WRITE_FORBIDDEN', 'Kanalga yozib bo‘lmaydi');
    if (opts.replyTo !== undefined && !this.thread(d).some((x) => x.id === opts.replyTo)) throw new TgError('MESSAGE_ID_INVALID', 'Xabar topilmadi');
    const kind: MediaInfo['kind'] = opts.round && file.mime.startsWith('video/') ? 'round' : opts.voice && file.mime.startsWith('audio/') ? 'voice' : opts.asFile ? 'file' : file.mime.startsWith('image/') ? 'photo' : file.mime.startsWith('video/') ? 'video' : file.mime.startsWith('audio/') ? 'audio' : 'file';
    const media: MediaInfo = { kind, name: file.name, mime: file.mime, size: file.data.length, ...(kind === 'voice' || kind === 'round' ? { duration: opts.duration ?? 0 } : {}), ...(kind === 'round' ? { width: 384, height: 384 } : {}) };
    const msg = this.append(d, { text: opts.caption ?? '', date: Math.floor(Date.now() / 1000), out: true, read: false, replyToId: opts.replyTo, media });
    this.uploads.set(`${d.id}:${msg.id}`, { mime: file.mime, name: file.name, data: file.data });
    this.emit({ type: 'message:new', message: msg });
    return { ...msg };
  }

  async openMedia(dialogId: string, messageId: number): Promise<MediaBlob> {
    this.requireReady();
    const d = this.peer(dialogId);
    const msg = this.thread(d).find((x) => x.id === messageId);
    if (!msg?.media) throw new TgError('MEDIA_NOT_FOUND', 'Fayl topilmadi');
    const blob = this.uploads.get(`${d.id}:${messageId}`) ?? mockBlob(messageId, msg.media);
    if (!blob) throw new TgError('MEDIA_NOT_FOUND', 'Fayl topilmadi');
    return blob;
  }

  async editMessage(dialogId: string, id: number, text: string): Promise<Message> {
    this.requireReady();
    const d = this.peer(dialogId);
    const m = this.thread(d).find((x) => x.id === id);
    if (!m) throw new TgError('MESSAGE_ID_INVALID', 'Xabar topilmadi');
    if (!m.out) throw new TgError('MESSAGE_AUTHOR_REQUIRED', 'Faqat o‘z xabaringizni tahrirlash mumkin');
    if (m.text === text) throw new TgError('MESSAGE_NOT_MODIFIED', 'Matn o‘zgarmagan');
    m.text = text;
    m.edited = true;
    this.refreshDialog(d);
    this.emit({ type: 'message:edit', message: { ...m } });
    return { ...m };
  }

  async deleteMessages(dialogId: string, ids: number[]): Promise<void> {
    this.requireReady();
    const d = this.peer(dialogId);
    const t = this.thread(d);
    const gone = ids.filter((id) => t.some((x) => x.id === id));
    this.threads.set(d.id, t.filter((x) => !gone.includes(x.id)));
    this.refreshDialog(d);
    if (gone.length) this.emit({ type: 'message:delete', dialogId: d.id, ids: gone });
  }

  async forwardMessages(fromId: string, ids: number[], toId: string): Promise<Message[]> {
    this.requireReady();
    const from = this.peer(fromId);
    const to = this.peer(toId);
    if (to.kind === 'channel') throw new TgError('CHAT_WRITE_FORBIDDEN', 'Kanalga yozib bo‘lmaydi');
    const src = this.thread(from).filter((x) => ids.includes(x.id));
    if (src.length === 0) throw new TgError('MESSAGE_ID_INVALID', 'Xabar topilmadi');
    return src.map((s) => {
      const m = this.append(to, { text: s.text, media: s.media, date: Math.floor(Date.now() / 1000), out: true, read: false, fwdFrom: s.out ? 'Siz' : (s.senderName ?? from.title) });
      const blob = this.uploads.get(`${from.id}:${s.id}`) ?? (s.media ? mockBlob(s.id, s.media) : undefined);
      if (blob) this.uploads.set(`${to.id}:${m.id}`, blob);
      this.emit({ type: 'message:new', message: m });
      return { ...m };
    });
  }

  async getAvatar(id: string): Promise<MediaBlob | null> {
    this.requireReady();
    if (id === 'me') return avatarSvg(1);
    const d = this.peer(id);
    return d.photo ? avatarSvg(Number(d.id)) : null;
  }

  async react(dialogId: string, messageId: number, emoji: string | null): Promise<Message> {
    this.requireReady();
    const d = this.peer(dialogId);
    const msg = this.thread(d).find((x) => x.id === messageId);
    if (!msg) throw new TgError('MESSAGE_ID_INVALID', 'Xabar topilmadi');
    const list = (msg.reactions ?? []).map((r) => ({ ...r }));
    const prev = list.find((r) => r.mine);
    // One reaction per user (as in regular Telegram): choosing the same emoji again removes it.
    if (prev) {
      prev.mine = false;
      prev.count -= 1;
    }
    if (emoji && prev?.emoji !== emoji) {
      const hit = list.find((r) => r.emoji === emoji);
      if (hit) {
        hit.count += 1;
        hit.mine = true;
      } else list.push({ emoji, count: 1, mine: true });
    }
    msg.reactions = list.filter((r) => r.count > 0);
    if (msg.reactions.length === 0) msg.reactions = undefined;
    this.emit({ type: 'message:edit', message: { ...msg } });
    return { ...msg };
  }

  async setPinned(dialogId: string, pinned: boolean): Promise<void> {
    this.requireReady();
    const d = this.peer(dialogId);
    if (pinned && !d.pinned && this.dialogs.filter((x) => x.pinned).length >= 5) throw new TgError('PINNED_DIALOGS_TOO_MUCH', 'Ko‘pi bilan 5 ta chatni mahkamlash mumkin');
    d.pinned = pinned;
    this.refreshDialog(d);
  }

  async setArchived(dialogId: string, archived: boolean): Promise<void> {
    this.requireReady();
    const d = this.peer(dialogId);
    d.archived = archived || undefined;
    if (archived) d.pinned = false; // like Telegram: an archived chat is not pinned in the main list
    this.refreshDialog(d);
  }

  async setMuted(dialogId: string, muted: boolean): Promise<void> {
    this.requireReady();
    const d = this.peer(dialogId);
    d.muted = muted;
    this.emit({ type: 'dialog:update', dialog: { ...d } });
  }

  async getShared(dialogId: string, kind: SharedKind, { limit, beforeId }: { limit: number; beforeId?: number }) {
    this.requireReady();
    const ok = (x: Message) =>
      kind === 'media' ? x.media?.kind === 'photo' || x.media?.kind === 'video' : kind === 'files' ? x.media?.kind === 'file' || x.media?.kind === 'audio' : !x.media && /https?:\/\/\S+/i.test(x.text);
    const all = this.thread(this.peer(dialogId)).filter((x) => ok(x) && (beforeId === undefined || x.id < beforeId)).reverse();
    return { items: all.slice(0, limit).map((x) => ({ ...x })), hasMore: all.length > limit };
  }

  async searchMessages(dialogId: string, query: string, { limit, beforeId }: { limit: number; beforeId?: number }) {
    this.requireReady();
    const q = query.trim().toLowerCase();
    const all = q ? this.thread(this.peer(dialogId)).filter((x) => x.text.toLowerCase().includes(q) && (beforeId === undefined || x.id < beforeId)).reverse() : [];
    return { items: all.slice(0, limit).map((x) => ({ ...x })), hasMore: all.length > limit };
  }

  async markRead(dialogId: string, maxId: number): Promise<void> {
    this.requireReady();
    const d = this.peer(dialogId);
    const t = this.thread(d);
    const last = t.at(-1)?.id ?? 0;
    // Reading everything clears the badge; reading part of the chat leaves the incoming messages after it unread.
    const unread = maxId <= 0 || maxId >= last ? 0 : Math.min(d.unread, t.filter((m) => !m.out && m.id > maxId).length);
    if (unread !== d.unread) {
      d.unread = unread;
      this.emit({ type: 'dialog:update', dialog: { ...d } });
    }
  }

  async setTyping(dialogId: string): Promise<void> {
    this.requireReady();
    this.peer(dialogId);
  }

  private markOutRead(d: Dialog, maxId: number) {
    let changed = false;
    for (const m of this.thread(d)) {
      if (m.out && !m.read && m.id <= maxId) {
        m.read = true;
        changed = true;
      }
    }
    if (changed) {
      this.refreshDialog(d);
      this.emit({ type: 'read', dialogId: d.id, maxId });
    }
  }

  private incoming(d: Dialog, text: string) {
    const sender = d.kind === 'group' ? pick(PEOPLE, d.id.length + text.length) : undefined;
    const m = this.append(d, { text, date: Math.floor(Date.now() / 1000), out: false, read: true, senderName: sender });
    d.unread += 1;
    this.emit({ type: 'message:new', message: m });
    this.emit({ type: 'dialog:update', dialog: { ...d } });
  }

  private poolFind(id: string): Dialog | undefined {
    const i = Number(id) - 5000;
    return i >= 0 && i < POOL.length ? poolDialog(i) : undefined;
  }

  onEvent(handler: (e: TgEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async dispose(): Promise<void> {
    this.stopRealtime();
    this.handlers.clear();
  }

  private becomeReady(): AuthState {
    this.startRealtime();
    return 'ready';
  }

  private requireReady() {
    if (this.state !== 'ready') throw new TgError('AUTH_KEY_UNREGISTERED', 'Tizimga kirilmagan');
  }

  private emit(e: TgEvent) {
    this.handlers.forEach((h) => h(e));
  }

  /** Fake incoming messages so the UI can be demoed live. */
  private startRealtime() {
    const ms = this.opts.realtimeMs ?? 12000;
    if (ms <= 0 || this.timer) return;
    let k = 0;
    this.timer = setInterval(() => {
      const candidates = this.dialogs.filter((d) => d.kind !== 'channel' && d.id !== '1');
      const d = pick(candidates, k++ * 5 + 2);
      this.emit({ type: 'typing', dialogId: d.id, name: d.title, typing: true });
      const text = pick(SNIPPETS, k * 7);
      this.later(1800, () => {
        this.emit({ type: 'typing', dialogId: d.id, name: d.title, typing: false });
        this.incoming(d, text);
      });
    }, ms);
    this.timer.unref();
  }

  private stopRealtime() {
    this.timeouts.forEach(clearTimeout);
    this.timeouts.clear();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
