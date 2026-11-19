import type { SharedKind, AuthState, CallRecord, Dialog, Folder, MediaBlob, Me, Message, Profile, TgEvent, UploadFile } from '../types.js';

/** Common contract for MOCK and REAL (GramJS) implementations. */
export interface TelegramService {
  readonly mode: 'mock' | 'real';
  getAuthState(): AuthState;
  sendCode(phone: string): Promise<void>;
  signIn(code: string): Promise<AuthState>;
  checkPassword(password: string): Promise<AuthState>;
  logout(): Promise<void>;
  getMe(): Promise<Me>;
  getDialogs(opts: { limit: number; offset: number }): Promise<{ items: Dialog[]; total: number }>;
  createGroup(title: string, userIds: string[]): Promise<Dialog>;
  createChannel(title: string, about?: string): Promise<Dialog>;
  /** Recent phone calls (read only: this app cannot place calls). */
  getCalls(): Promise<CallRecord[]>;
  /** The user's own chat folders (empty when they have none). */
  getFolders(): Promise<Folder[]>;
  /** Messages older than `beforeId` (or the newest), returned oldest-first. */
  getHistory(dialogId: string, opts: { limit: number; beforeId?: number }): Promise<{ items: Message[]; hasMore: boolean }>;
  /** Global username/name search (people, groups, channels). */
  searchGlobal(query: string): Promise<Dialog[]>;
  getProfile(id: string): Promise<Profile>;
  sendMessage(dialogId: string, text: string, replyTo?: number): Promise<Message>;
  editMessage(dialogId: string, id: number, text: string): Promise<Message>;
  deleteMessages(dialogId: string, ids: number[], revoke: boolean): Promise<void>;
  forwardMessages(fromId: string, ids: number[], toId: string): Promise<Message[]>;
  sendMedia(dialogId: string, file: UploadFile, opts: { caption?: string; replyTo?: number; asFile: boolean; voice?: boolean; round?: boolean; duration?: number }): Promise<Message>;
  /** Full file, or a small preview when `thumb` is set. */
  openMedia(dialogId: string, messageId: number, thumb: boolean): Promise<MediaBlob>;
  /** Small profile picture, or null when the peer has none. `me` means the signed-in user. */
  getAvatar(id: string): Promise<MediaBlob | null>;
  /** Sets (or with null removes) your reaction. Returns the updated message. */
  react(dialogId: string, messageId: number, emoji: string | null): Promise<Message>;
  setPinned(dialogId: string, pinned: boolean): Promise<void>;
  setMuted(dialogId: string, muted: boolean): Promise<void>;
  setArchived(dialogId: string, archived: boolean): Promise<void>;
  /** Shared media of a chat (photos/videos, files, links), newest first: the tabs of the info panel. */
  getShared(dialogId: string, kind: SharedKind, opts: { limit: number; beforeId?: number }): Promise<{ items: Message[]; hasMore: boolean }>;
  /** Text search inside one chat, newest first. */
  searchMessages(dialogId: string, query: string, opts: { limit: number; beforeId?: number }): Promise<{ items: Message[]; hasMore: boolean }>;
  markRead(dialogId: string, maxId: number): Promise<void>;
  setTyping(dialogId: string): Promise<void>;
  /** Subscribe to realtime events; returns unsubscribe. */
  onEvent(handler: (e: TgEvent) => void): () => void;
  /** Stop timers / connections. */
  dispose(): Promise<void>;
}
