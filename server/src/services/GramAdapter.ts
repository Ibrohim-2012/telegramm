import type { CallRecord, Dialog, Folder, MediaBlob, Me, Message, Profile, TgEvent, UploadFile, SharedKind } from '../types.js';

export type AdapterEvent =
  | Extract<TgEvent, { type: 'message:new' | 'message:edit' | 'message:delete' | 'typing' | 'read' }>
  /** The unread counter of a chat changed because it was read elsewhere. */
  | { type: 'unread'; dialogId: string; unread: number };

/** Thin boundary around GramJS so the service logic is testable without the network. */
export interface GramAdapter {
  connect(): Promise<void>;
  isAuthorized(): Promise<boolean>;
  sendCode(phone: string): Promise<{ codeHash: string }>;
  /** Resolves 'password' when the account has 2FA enabled. */
  signIn(phone: string, codeHash: string, code: string): Promise<'ok' | 'password'>;
  checkPassword(password: string): Promise<void>;
  me(): Promise<Me>;
  dialogs(limit: number): Promise<{ items: Dialog[]; total: number }>;
  folders(): Promise<Folder[]>;
  createGroup(title: string, userIds: string[]): Promise<Dialog>;
  createChannel(title: string, about?: string): Promise<Dialog>;
  calls(): Promise<CallRecord[]>;
  history(dialogId: string, limit: number, beforeId?: number): Promise<{ items: Message[]; hasMore: boolean }>;
  searchGlobal(query: string): Promise<Dialog[]>;
  profile(id: string): Promise<Profile>;
  send(dialogId: string, text: string, replyTo?: number): Promise<Message>;
  edit(dialogId: string, id: number, text: string): Promise<Message>;
  remove(dialogId: string, ids: number[], revoke: boolean): Promise<void>;
  forward(fromId: string, ids: number[], toId: string): Promise<Message[]>;
  sendMedia(dialogId: string, file: UploadFile, opts: { caption?: string; replyTo?: number; asFile: boolean; voice?: boolean; round?: boolean; duration?: number }): Promise<Message>;
  openMedia(dialogId: string, messageId: number, thumb: boolean): Promise<MediaBlob>;
  avatar(id: string): Promise<MediaBlob | null>;
  react(dialogId: string, messageId: number, emoji: string | null): Promise<Message>;
  setPinned(dialogId: string, pinned: boolean): Promise<void>;
  setMuted(dialogId: string, muted: boolean): Promise<void>;
  setArchived(dialogId: string, archived: boolean): Promise<void>;
  shared(dialogId: string, kind: SharedKind, limit: number, beforeId?: number): Promise<{ items: Message[]; hasMore: boolean }>;
  searchMessages(dialogId: string, query: string, limit: number, beforeId?: number): Promise<{ items: Message[]; hasMore: boolean }>;
  markRead(dialogId: string, maxId: number): Promise<void>;
  /** Telegram's own unread counter for one chat (after reading part of it). */
  unreadOf(dialogId: string): Promise<number>;
  typing(dialogId: string): Promise<void>;
  /** Telegram updates -> events. Returns unsubscribe. */
  subscribe(cb: (e: AdapterEvent) => void): () => void;
  exportSession(): string;
  logOut(): Promise<void>;
  disconnect(): Promise<void>;
}
