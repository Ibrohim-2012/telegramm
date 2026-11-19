import bigInt from 'big-integer';
import { Api, TelegramClient, utils } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { computeCheck } from 'telegram/Password.js';
import { NewMessage } from 'telegram/events/NewMessage.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
import { DeletedMessage } from 'telegram/events/DeletedMessage.js';
import { Raw } from 'telegram/events/Raw.js';
import type { DeletedMessageEvent } from 'telegram/events/DeletedMessage.js';
import type { NewMessageEvent } from 'telegram/events/NewMessage.js';
import { CustomFile } from 'telegram/client/uploads.js';
import { TgError, type CallRecord, type Dialog, type Folder, type MediaBlob, type MediaInfo, type Me, type Message, type Profile, type ReplyPreview, type ServiceKind, type SharedKind, type UploadFile } from '../types.js';
import type { AdapterEvent, GramAdapter } from './GramAdapter.js';

const MAX_DOWNLOAD = 25 * 1024 * 1024;

/** Reads what the UI needs to know about a Telegram media object. */
export function describeMedia(media: Api.TypeMessageMedia | undefined): MediaInfo | undefined {
  if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) {
    const big = media.photo.sizes.filter((s): s is Api.PhotoSize => s instanceof Api.PhotoSize).at(-1);
    return { kind: 'photo', mime: 'image/jpeg', width: big?.w, height: big?.h, thumb: true };
  }
  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const doc = media.document;
    const attr = <T extends Api.TypeDocumentAttribute>(c: new (...a: never[]) => T) => doc.attributes.find((a): a is T => a instanceof c);
    const video = attr(Api.DocumentAttributeVideo);
    const audio = attr(Api.DocumentAttributeAudio);
    const sticker = attr(Api.DocumentAttributeSticker);
    const animated = attr(Api.DocumentAttributeAnimated);
    const base = { mime: doc.mimeType, size: Number(doc.size), name: attr(Api.DocumentAttributeFilename)?.fileName };
    if (sticker) return { ...base, kind: 'sticker', alt: sticker.alt, width: 256, height: 256 };
    if (animated && video) return { ...base, kind: 'gif', width: video.w, height: video.h, duration: video.duration };
    if (video?.roundMessage) return { ...base, kind: 'round', width: video.w, height: video.h, duration: video.duration, thumb: (doc.thumbs?.length ?? 0) > 0 };
    if (video) return { ...base, kind: 'video', width: video.w, height: video.h, duration: video.duration, thumb: (doc.thumbs?.length ?? 0) > 0 };
    if (audio) return { ...base, kind: audio.voice ? 'voice' : 'audio', duration: audio.duration };
    return { ...base, kind: 'file' };
  }
  return undefined;
}

const hasPhoto = (e: unknown): boolean => {
  const ph = (e as { photo?: unknown } | undefined)?.photo;
  return !!ph && !(ph instanceof Api.UserProfilePhotoEmpty) && !(ph instanceof Api.ChatPhotoEmpty);
};

/** Maps Telegram's many MessageAction* classes onto the few kinds the UI knows. */
export function serviceKind(action: unknown): ServiceKind {
  if (!action || typeof action !== 'object') return 'other';
  const n = (action as { className?: string }).className ?? action.constructor?.name ?? '';
  if (/ChatAddUser|ChatJoinedByLink|ChatJoinedByRequest|ChatJoinedBy/.test(n)) return 'joined';
  if (/ChatDeleteUser/.test(n)) return 'left';
  if (/ChatCreate|ChannelCreate|ChatMigrate|ChannelMigrate/.test(n)) return 'created';
  if (/PinMessage/.test(n)) return 'pinned';
  if (/ChatEditTitle|ChannelEditTitle/.test(n)) return 'title';
  if (/ChatEditPhoto|ChatDeletePhoto/.test(n)) return 'photo';
  if (/PhoneCall/.test(n)) return 'call';
  if (/HistoryClear/.test(n)) return 'cleared';
  if (/Topic/.test(n)) return 'topic';
  return 'other';
}

const nameOf = (e: unknown): string | undefined => {
  const x = e as { firstName?: string; lastName?: string; title?: string } | undefined;
  return x ? ([x.firstName, x.lastName].filter(Boolean).join(' ') || x.title || undefined) : undefined;
};

export class GramJsAdapter implements GramAdapter {
  private readonly session: StringSession;
  private readonly client: TelegramClient;
  /** Input peers and read markers learned from dialogs/search so we never re-resolve by id. */
  private readonly peers = new Map<string, Api.TypeInputPeer>();
  private readonly readOut = new Map<string, number>();
  private selfId = '';

  constructor(
    private readonly apiId: number,
    private readonly apiHash: string,
    saved = '',
  ) {
    this.session = new StringSession(saved);
    this.client = new TelegramClient(this.session, apiId, apiHash, {
      connectionRetries: 5,
      retryDelay: 1500,
      autoReconnect: true,
      floodSleepThreshold: 0, // surface FLOOD_WAIT to us; we show a countdown instead of silently sleeping
      useWSS: false,
    });
    this.client.setLogLevel('error' as never);
  }

  async connect() {
    await this.client.connect();
  }

  isAuthorized() {
    return this.client.checkAuthorization();
  }

  async sendCode(phone: string) {
    const r = await this.client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: this.apiId,
        apiHash: this.apiHash,
        settings: new Api.CodeSettings({}),
      }),
    );
    if (!('phoneCodeHash' in r)) throw new Error('Unexpected SendCode result');
    return { codeHash: r.phoneCodeHash };
  }

  async signIn(phone: string, codeHash: string, code: string) {
    try {
      await this.client.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash: codeHash, phoneCode: code }));
      return 'ok' as const;
    } catch (e) {
      if ((e as { errorMessage?: string }).errorMessage === 'SESSION_PASSWORD_NEEDED') return 'password' as const;
      throw e;
    }
  }

  async checkPassword(password: string) {
    const pwd = await this.client.invoke(new Api.account.GetPassword());
    await this.client.invoke(new Api.auth.CheckPassword({ password: await computeCheck(pwd, password) }));
  }

  async me(): Promise<Me> {
    const u = (await this.client.getMe()) as Api.User;
    this.selfId = String(u.id);
    return {
      id: String(u.id),
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? undefined,
      username: u.username ?? undefined,
      phone: u.phone ? `+${u.phone}` : '',
    };
  }

  async dialogs(limit: number): Promise<{ items: Dialog[]; total: number }> {
    const list = await this.client.getDialogs({ limit });
    let pin = 0;
    const items = list.map((d): Dialog => {
      const e = d.entity;
      this.peers.set(String(d.id), d.inputEntity);
      this.readOut.set(String(d.id), d.dialog.readOutboxMaxId);
      const broadcast = e instanceof Api.Channel && e.broadcast === true;
      const kind: Dialog['kind'] = d.isUser ? 'private' : broadcast ? 'channel' : 'group';
      const m = d.message;
      const mute = d.dialog.notifySettings?.muteUntil;
      const info = m ? describeMedia(m.media) : undefined;
      const flags = e as { verified?: boolean; bot?: boolean; contact?: boolean } | undefined;
      return {
        id: String(d.id),
        kind,
        title: d.title ?? d.name ?? '',
        username: e && 'username' in e && e.username ? e.username : undefined,
        lastMessage: m
          ? {
              text: m.text || (info ? '' : m.media ? '📎' : ''),
              date: m.date,
              out: Boolean(m.out),
              read: m.out ? m.id <= d.dialog.readOutboxMaxId : true,
              // Group chats prefix the preview with who wrote the last message.
              sender: !m.out && kind === 'group' ? nameOf(m.sender)?.split(' ')[0] : undefined,
              media: info?.kind,
              service: m.action ? serviceKind(m.action) : undefined,
            }
          : undefined,
        unread: d.unreadCount,
        pinned: Boolean(d.pinned),
        archived: d.archived ? true : undefined,
        pinOrder: d.pinned ? pin++ : undefined,
        muted: typeof mute === 'number' && mute > Date.now() / 1000,
        online: e instanceof Api.User && e.status instanceof Api.UserStatusOnline,
        photo: hasPhoto(e),
        verified: flags?.verified || undefined,
        bot: flags?.bot || undefined,
        contact: kind === 'private' ? Boolean(flags?.contact) : undefined,
      };
    });
    return { items, total: Math.max((list as unknown as { total?: number }).total ?? 0, items.length) };
  }

  /** A freshly created chat as a list entry, and remember how to address it. */
  private newDialog(chat: Api.TypeChat | undefined, kind: Dialog['kind']): Dialog {
    if (!chat || !(chat instanceof Api.Chat || chat instanceof Api.Channel)) throw new TgError('CREATE_FAILED', 'Telegram yangi chatni qaytarmadi');
    const id = String(utils.getPeerId(chat));
    this.peers.set(id, utils.getInputPeer(chat));
    return { id, kind, title: chat.title, unread: 0, pinned: false, muted: false, online: false, photo: false };
  }

  async createGroup(title: string, userIds: string[]): Promise<Dialog> {
    const users: Api.InputUser[] = [];
    for (const id of userIds) {
      const p = await this.peer(id);
      if (!(p instanceof Api.InputPeerUser)) throw new TgError('BAD_INPUT', 'Guruhga faqat foydalanuvchilarni qo‘shish mumkin');
      users.push(new Api.InputUser({ userId: p.userId, accessHash: p.accessHash }));
    }
    const r = await this.client.invoke(new Api.messages.CreateChat({ users, title }));
    const updates = 'updates' in r ? r.updates : r;
    return this.newDialog((updates as { chats?: Api.TypeChat[] }).chats?.[0], 'group');
  }

  async createChannel(title: string, about = ''): Promise<Dialog> {
    const r = await this.client.invoke(new Api.channels.CreateChannel({ title, about, broadcast: true }));
    return this.newDialog((r as { chats?: Api.TypeChat[] }).chats?.[0], 'channel');
  }

  async calls(): Promise<CallRecord[]> {
    const r = await this.client.invoke(
      new Api.messages.Search({
        peer: new Api.InputPeerEmpty(),
        q: '',
        filter: new Api.InputMessagesFilterPhoneCalls({}),
        minDate: 0,
        maxDate: 0,
        offsetId: 0,
        addOffset: 0,
        limit: 50,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      }),
    );
    if (!('messages' in r)) return [];
    const users = new Map<string, Api.TypeUser>(r.users.map((u) => [String(u.id), u]));
    const out: CallRecord[] = [];
    for (const m of r.messages) {
      if (!(m instanceof Api.MessageService) || !(m.action instanceof Api.MessageActionPhoneCall)) continue;
      const peer = m.out ? m.peerId : (m.fromId ?? m.peerId);
      const uid = peer instanceof Api.PeerUser ? String(peer.userId) : '';
      const reason = m.action.reason;
      out.push({
        id: m.id,
        userId: uid,
        name: nameOf(users.get(uid)) ?? uid,
        date: m.date,
        out: Boolean(m.out),
        missed: reason instanceof Api.PhoneCallDiscardReasonMissed || reason instanceof Api.PhoneCallDiscardReasonBusy,
        video: Boolean(m.action.video),
        duration: m.action.duration ?? 0,
      });
    }
    return out;
  }

  async folders(): Promise<Folder[]> {
    const r = await this.client.invoke(new Api.messages.GetDialogFilters());
    const filters = 'filters' in r ? r.filters : (r as unknown as Api.TypeDialogFilter[]);
    const ids = (peers: Api.TypeInputPeer[]) => peers.map((p) => String(utils.getPeerId(p)));
    const out: Folder[] = [];
    for (const f of filters) {
      if (f instanceof Api.DialogFilter) {
        const title = typeof f.title === 'string' ? f.title : ((f.title as { text?: string }).text ?? '');
        out.push({
          id: f.id,
          title,
          emoticon: f.emoticon ?? undefined,
          includeIds: ids([...f.pinnedPeers, ...f.includePeers]),
          excludeIds: ids(f.excludePeers),
          contacts: f.contacts || undefined,
          nonContacts: f.nonContacts || undefined,
          groups: f.groups || undefined,
          broadcasts: f.broadcasts || undefined,
          bots: f.bots || undefined,
          excludeMuted: f.excludeMuted || undefined,
          excludeRead: f.excludeRead || undefined,
        });
      } else if (f instanceof Api.DialogFilterChatlist) {
        const title = typeof f.title === 'string' ? f.title : ((f.title as { text?: string }).text ?? '');
        out.push({ id: f.id, title, emoticon: f.emoticon ?? undefined, includeIds: ids([...f.pinnedPeers, ...f.includePeers]), excludeIds: [] });
      }
    }
    return out;
  }

  private async peer(id: string): Promise<Api.TypeInputPeer> {
    const cached = this.peers.get(id);
    if (cached) return cached;
    if (!this.selfId) await this.me();
    // Saved Messages is the chat with yourself; resolve it through the special 'me' alias.
    const p = id === this.selfId ? await this.client.getInputEntity('me') : await this.client.getInputEntity(bigInt(id));
    this.peers.set(id, p);
    return p;
  }

  private static label(m: Api.Message): string {
    // m.text is the markdown-unparsed message (bold/italic/code/links survive the round trip).
    if (m.text) return m.text;
    const info = describeMedia(m.media);
    if (info) return '';
    return m.media ? '📎' : '';
  }

  private static reactionsOf(m: Api.Message): Message['reactions'] {
    const out = (m.reactions?.results ?? []).flatMap((r) =>
      r.reaction instanceof Api.ReactionEmoji ? [{ emoji: r.reaction.emoticon, count: r.count, mine: r.chosenOrder !== undefined }] : [],
    );
    return out.length ? out : undefined;
  }

  /** A reply target in a forum topic is just the topic root: only real replies count. */
  private static replyTarget(m: Api.Message): number | undefined {
    const h = m.replyTo as { replyToMsgId?: number; replyToTopId?: number; forumTopic?: boolean } | undefined;
    if (!h?.replyToMsgId) return undefined;
    if (h.forumTopic && h.replyToTopId === undefined) return undefined;
    return h.replyToMsgId;
  }

  private mapMessage(m: Api.Message, dialogId: string): Message {
    const readMax = this.readOut.get(dialogId) ?? 0;
    const sender = m.sender;
    const fwd = (m as unknown as { forward?: { sender?: unknown; chat?: unknown } }).forward;
    const senderId = (m as unknown as { senderId?: { toString(): string } }).senderId?.toString();
    const base: Message = {
      id: m.id,
      dialogId,
      text: GramJsAdapter.label(m),
      date: m.date,
      out: Boolean(m.out),
      read: m.out ? m.id <= readMax : true,
      senderName: !m.out && sender ? nameOf(sender)?.split(' ')[0] : undefined,
      senderId: !m.out ? senderId : undefined,
      replyToId: GramJsAdapter.replyTarget(m),
      edited: m.editDate ? true : undefined,
      fwdFrom: m.fwdFrom ? (nameOf(fwd?.chat) ?? nameOf(fwd?.sender) ?? m.fwdFrom.fromName ?? m.fwdFrom.postAuthor ?? 'Telegram') : undefined,
      media: describeMedia(m.media),
      reactions: GramJsAdapter.reactionsOf(m),
    };
    if (m.action) {
      // Service message: shown as a small centred line, never as a bubble.
      return { ...base, text: '', service: { kind: serviceKind(m.action), name: nameOf(sender), extra: (m.action as { title?: string }).title } };
    }
    return base;
  }

  /** Fetches the messages that replies on this page point to (when they are not on the page itself). */
  private async replyPreviews(peer: Api.TypeInputPeer, msgs: Message[]): Promise<Map<number, ReplyPreview>> {
    const have = new Set(msgs.map((m) => m.id));
    const need = [...new Set(msgs.flatMap((m) => (m.replyToId !== undefined && !have.has(m.replyToId) ? [m.replyToId] : [])))].slice(0, 30);
    const out = new Map<number, ReplyPreview>();
    if (need.length === 0) return out;
    try {
      const found = await this.client.getMessages(peer, { ids: need });
      for (const r of found) {
        if (!r || !('id' in r) || !(r instanceof Api.Message)) continue;
        out.set(r.id, { name: nameOf(r.sender)?.split(' ')[0], text: GramJsAdapter.label(r), out: Boolean(r.out) || undefined, media: describeMedia(r.media)?.kind });
      }
    } catch {
      /* the quote just falls back to a placeholder */
    }
    return out;
  }

  async history(dialogId: string, limit: number, beforeId?: number) {
    const peer = await this.peer(dialogId);
    const list = await this.client.getMessages(peer, { limit: limit + 1, offsetId: beforeId ?? 0 });
    const raw = [...list].filter((m): m is Api.Message => {
      const x: unknown = m;
      return x instanceof Api.Message || x instanceof Api.MessageService;
    });
    const hasMore = raw.length > limit;
    const items = raw
      .slice(0, limit)
      .reverse()
      .map((m) => this.mapMessage(m as Api.Message, dialogId));
    const previews = await this.replyPreviews(peer, items);
    for (const m of items) if (m.replyToId !== undefined && previews.has(m.replyToId)) m.reply = previews.get(m.replyToId);
    return { items, hasMore };
  }

  async send(dialogId: string, text: string, replyTo?: number) {
    const m = await this.client.sendMessage(await this.peer(dialogId), { message: text, replyTo });
    return this.mapMessage(m, dialogId);
  }

  async edit(dialogId: string, id: number, text: string) {
    const m = await this.client.editMessage(await this.peer(dialogId), { message: id, text });
    return this.mapMessage(m, dialogId);
  }

  async remove(dialogId: string, ids: number[], revoke: boolean) {
    await this.client.deleteMessages(await this.peer(dialogId), ids, { revoke });
  }

  async forward(fromId: string, ids: number[], toId: string) {
    const list = await this.client.forwardMessages(await this.peer(toId), { messages: ids, fromPeer: await this.peer(fromId) });
    return list.map((m) => this.mapMessage(m, toId));
  }

  async sendMedia(dialogId: string, file: UploadFile, opts: { caption?: string; replyTo?: number; asFile: boolean; voice?: boolean; round?: boolean; duration?: number }) {
    const f = new CustomFile(file.name, file.data.length, '', file.data);
    const m = await this.client.sendFile(await this.peer(dialogId), {
      file: f,
      caption: opts.caption,
      replyTo: opts.replyTo,
      forceDocument: opts.asFile && !opts.voice && !opts.round,
      ...(opts.round ? { videoNote: true, attributes: [new Api.DocumentAttributeVideo({ roundMessage: true, supportsStreaming: true, duration: Math.max(1, Math.round(opts.duration ?? 1)), w: 384, h: 384 })] } : {}),
      ...(opts.voice ? { voiceNote: true, attributes: [new Api.DocumentAttributeAudio({ voice: true, duration: Math.max(0, Math.round(opts.duration ?? 0)) })] } : {}),
    });
    return this.mapMessage(m, dialogId);
  }

  async openMedia(dialogId: string, messageId: number, thumb: boolean): Promise<MediaBlob> {
    const [m] = await this.client.getMessages(await this.peer(dialogId), { ids: messageId });
    const info = m instanceof Api.Message ? describeMedia(m.media) : undefined;
    if (!(m instanceof Api.Message) || !info) throw new TgError('MEDIA_NOT_FOUND', 'Fayl topilmadi');
    const name = info.name ?? `${info.kind}-${messageId}`;
    if (thumb) {
      // Smallest previews first; fall back to the full photo (photos are small enough).
      for (const idx of info.kind === 'photo' ? [1, 0] : [0]) {
        const t = await this.client.downloadMedia(m, { thumb: idx }).catch(() => undefined);
        if (t && t.length > 0) return { mime: 'image/jpeg', name, data: Buffer.from(t) };
      }
      if (info.kind !== 'photo') throw new TgError('MEDIA_NOT_FOUND', 'Preview yo‘q');
    }
    if ((info.size ?? 0) > MAX_DOWNLOAD) throw new TgError('FILE_TOO_BIG', 'Fayl juda katta (25 MB dan oshiq)');
    const data = await this.client.downloadMedia(m);
    if (!data || typeof data === 'string') throw new TgError('MEDIA_NOT_FOUND', 'Fayl topilmadi');
    return { mime: info.mime ?? 'application/octet-stream', name, data: Buffer.from(data) };
  }

  async avatar(id: string): Promise<MediaBlob | null> {
    const peer = id === 'me' ? await this.client.getInputEntity('me') : await this.peer(id);
    const buf = await this.client.downloadProfilePhoto(peer, { isBig: false });
    if (!buf || typeof buf === 'string' || buf.length === 0) return null;
    return { mime: 'image/jpeg', name: `avatar-${id}.jpg`, data: Buffer.from(buf) };
  }

  async markRead(dialogId: string, maxId: number) {
    await this.client.markAsRead(await this.peer(dialogId), undefined, { maxId });
  }

  async unreadOf(dialogId: string) {
    const r = await this.client.invoke(new Api.messages.GetPeerDialogs({ peers: [new Api.InputDialogPeer({ peer: await this.peer(dialogId) })] }));
    const d = r.dialogs[0];
    return d instanceof Api.Dialog ? d.unreadCount : 0;
  }

  async typing(dialogId: string) {
    await this.client.invoke(new Api.messages.SetTyping({ peer: await this.peer(dialogId), action: new Api.SendMessageTypingAction() }));
  }

  async react(dialogId: string, messageId: number, emoji: string | null) {
    const peer = await this.peer(dialogId);
    await this.client.invoke(
      new Api.messages.SendReaction({ peer, msgId: messageId, reaction: emoji ? [new Api.ReactionEmoji({ emoticon: emoji })] : [] }),
    );
    const [m] = await this.client.getMessages(peer, { ids: messageId });
    if (!(m instanceof Api.Message)) throw new TgError('MESSAGE_ID_INVALID', 'Xabar topilmadi');
    return this.mapMessage(m, dialogId);
  }

  async setPinned(dialogId: string, pinned: boolean) {
    await this.client.invoke(new Api.messages.ToggleDialogPin({ peer: new Api.InputDialogPeer({ peer: await this.peer(dialogId) }), pinned }));
  }

  async setArchived(dialogId: string, archived: boolean) {
    await this.client.invoke(new Api.folders.EditPeerFolders({ folderPeers: [new Api.InputFolderPeer({ peer: await this.peer(dialogId), folderId: archived ? 1 : 0 })] }));
  }

  async setMuted(dialogId: string, muted: boolean) {
    await this.client.invoke(
      new Api.account.UpdateNotifySettings({
        peer: new Api.InputNotifyPeer({ peer: await this.peer(dialogId) }),
        settings: new Api.InputPeerNotifySettings({ muteUntil: muted ? 2147483647 : 0 }),
      }),
    );
  }

  async shared(dialogId: string, kind: SharedKind, limit: number, beforeId?: number) {
    const filter = kind === 'media' ? new Api.InputMessagesFilterPhotoVideo() : kind === 'files' ? new Api.InputMessagesFilterDocument() : new Api.InputMessagesFilterUrl();
    const list = await this.client.getMessages(await this.peer(dialogId), { filter, limit: limit + 1, offsetId: beforeId ?? 0 });
    const msgs = [...list].filter((m): m is Api.Message => m instanceof Api.Message);
    return { items: msgs.slice(0, limit).map((m) => this.mapMessage(m, dialogId)), hasMore: msgs.length > limit };
  }

  async searchMessages(dialogId: string, query: string, limit: number, beforeId?: number) {
    const list = await this.client.getMessages(await this.peer(dialogId), { search: query, limit: limit + 1, offsetId: beforeId ?? 0 });
    const msgs = [...list].filter((m): m is Api.Message => m instanceof Api.Message);
    return { items: msgs.slice(0, limit).map((m) => this.mapMessage(m, dialogId)), hasMore: msgs.length > limit };
  }

  subscribe(cb: (e: AdapterEvent) => void) {
    const dialogOf = (m: Api.Message) => String(utils.getPeerId(m.peerId));
    const onNew = (ev: NewMessageEvent) => {
      const m = ev.message;
      if (m instanceof Api.Message) cb({ type: 'message:new', message: this.mapMessage(m, dialogOf(m)) });
    };
    const onEdit = (ev: NewMessageEvent) => {
      const m = ev.message;
      if (m instanceof Api.Message) cb({ type: 'message:edit', message: this.mapMessage(m, dialogOf(m)) });
    };
    const onDel = (ev: DeletedMessageEvent) => {
      // Only channel deletions name the peer; plain message ids are unique per account otherwise.
      cb({ type: 'message:delete', dialogId: ev.peer ? String(utils.getPeerId(ev.peer)) : '', ids: ev.deletedIds });
    };
    const onRaw = (u: Api.TypeUpdate) => {
      if (u instanceof Api.UpdateUserTyping) {
        cb({ type: 'typing', dialogId: String(u.userId), typing: !(u.action instanceof Api.SendMessageCancelAction) });
      } else if (u instanceof Api.UpdateChatUserTyping) {
        cb({ type: 'typing', dialogId: `-${u.chatId}`, typing: !(u.action instanceof Api.SendMessageCancelAction) });
      } else if (u instanceof Api.UpdateChannelUserTyping) {
        cb({ type: 'typing', dialogId: `-100${u.channelId}`, typing: !(u.action instanceof Api.SendMessageCancelAction) });
      } else if (u instanceof Api.UpdateMessageReactions) {
        const dialogId = String(utils.getPeerId(u.peer));
        void this.peer(dialogId)
          .then((p) => this.client.getMessages(p, { ids: u.msgId }))
          .then(([m]) => m instanceof Api.Message && cb({ type: 'message:edit', message: this.mapMessage(m, dialogId) }))
          .catch(() => {});
      } else if (u instanceof Api.UpdateReadHistoryInbox) {
        // You read the chat on another device (phone, Telegram Desktop): our unread counter must follow.
        cb({ type: 'unread', dialogId: String(utils.getPeerId(u.peer)), unread: u.stillUnreadCount });
      } else if (u instanceof Api.UpdateReadChannelInbox) {
        cb({ type: 'unread', dialogId: `-100${u.channelId}`, unread: u.stillUnreadCount });
      } else if (u instanceof Api.UpdateReadHistoryOutbox) {
        const dialogId = String(utils.getPeerId(u.peer));
        this.readOut.set(dialogId, u.maxId);
        cb({ type: 'read', dialogId, maxId: u.maxId });
      }
    };
    const builders: [(e: never) => void, NewMessage | EditedMessage | DeletedMessage | Raw][] = [
      [onNew, new NewMessage({})],
      [onEdit, new EditedMessage({})],
      [onDel, new DeletedMessage({})],
      [onRaw, new Raw({})],
    ];
    for (const [fn, b] of builders) this.client.addEventHandler(fn as never, b);
    return () => {
      for (const [fn, b] of builders) this.client.removeEventHandler(fn as never, b);
    };
  }

  async searchGlobal(query: string): Promise<Dialog[]> {
    const r = await this.client.invoke(new Api.contacts.Search({ q: query, limit: 10 }));
    const out: Dialog[] = [];
    for (const e of [...r.users, ...r.chats]) {
      if (!(e instanceof Api.User || e instanceof Api.Channel || e instanceof Api.Chat)) continue;
      if (e instanceof Api.User && (e.self || e.bot)) continue;
      const id = String(utils.getPeerId(e));
      this.peers.set(id, utils.getInputPeer(e));
      const kind: Dialog['kind'] = e instanceof Api.User ? 'private' : e instanceof Api.Channel && e.broadcast ? 'channel' : 'group';
      out.push({
        id,
        kind,
        title: e instanceof Api.User ? [e.firstName, e.lastName].filter(Boolean).join(' ') || e.username || id : e.title,
        username: 'username' in e && e.username ? e.username : undefined,
        unread: 0,
        pinned: false,
        muted: false,
        online: e instanceof Api.User && e.status instanceof Api.UserStatusOnline,
        photo: hasPhoto(e),
      });
    }
    return out;
  }

  async profile(id: string): Promise<Profile> {
    const e = await this.client.getEntity(await this.peer(id));
    if (e instanceof Api.User) {
      const full = await this.client.invoke(new Api.users.GetFullUser({ id: e }));
      const st = e.status;
      return {
        id,
        kind: 'private',
        title: [e.firstName, e.lastName].filter(Boolean).join(' ') || e.username || id,
        username: e.username ?? undefined,
        phone: e.phone ? `+${e.phone}` : undefined,
        bio: full.fullUser.about ?? undefined,
        online: st instanceof Api.UserStatusOnline,
        lastSeen: st instanceof Api.UserStatusOffline ? st.wasOnline : undefined,
      };
    }
    if (e instanceof Api.Channel) {
      const full = await this.client.invoke(new Api.channels.GetFullChannel({ channel: e }));
      const fc = full.fullChat as Api.ChannelFull;
      return {
        id,
        kind: e.broadcast ? 'channel' : 'group',
        title: e.title,
        username: e.username ?? undefined,
        bio: fc.about || undefined,
        members: fc.participantsCount ?? undefined,
      };
    }
    if (e instanceof Api.Chat) {
      return { id, kind: 'group', title: e.title, members: e.participantsCount };
    }
    throw new Error('Unsupported peer');
  }

  exportSession() {
    return this.session.save();
  }

  async logOut() {
    await this.client.invoke(new Api.auth.LogOut());
  }

  async disconnect() {
    await this.client.disconnect();
    await this.client.destroy();
  }
}
