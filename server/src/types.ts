export type AuthState = 'logged_out' | 'code_sent' | 'password_needed' | 'ready';

export type DialogKind = 'private' | 'group' | 'channel';

export interface Me {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone: string;
}

export interface LastMessage {
  text: string;
  date: number; // unix seconds
  out: boolean;
  read: boolean;
  /** First name of the sender (group chats show "Name: text"). */
  sender?: string;
  /** What kind of attachment the message carries, so the UI can show "Photo", "Voice message"... */
  media?: MediaKind;
  /** Service message ("X joined", "pinned a message"...). */
  service?: ServiceKind;
}

export interface Dialog {
  id: string;
  kind: DialogKind;
  title: string;
  username?: string;
  lastMessage?: LastMessage;
  unread: number;
  pinned: boolean;
  /** In Telegram's archive (folder 1): hidden from the main list until taken out. */
  archived?: boolean;
  muted: boolean;
  online: boolean;
  /** Has a profile photo (so the UI only requests /api/avatar when there is one). */
  photo?: boolean;
  /** Position among pinned chats as Telegram orders them (0 = first). */
  pinOrder?: number;
  verified?: boolean;
  bot?: boolean;
  /** A private chat with someone in your contacts. */
  contact?: boolean;
}

/** One of the user's own Telegram chat folders. */
export interface Folder {
  id: number;
  title: string;
  emoticon?: string;
  includeIds: string[];
  excludeIds: string[];
  contacts?: boolean;
  nonContacts?: boolean;
  groups?: boolean;
  broadcasts?: boolean;
  bots?: boolean;
  excludeMuted?: boolean;
  excludeRead?: boolean;
}

export type MediaKind = 'photo' | 'video' | 'file' | 'voice' | 'audio' | 'sticker' | 'gif' | 'round';

export interface MediaInfo {
  kind: MediaKind;
  name?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  /** Seconds, for voice/audio/video. */
  duration?: number;
  /** Emoji for stickers (animated .tgs stickers can't be drawn in <img>). */
  alt?: string;
  /** True when a small preview exists (photos, videos). */
  thumb?: boolean;
}

export interface MediaBlob {
  mime: string;
  name: string;
  data: Buffer;
}

export interface UploadFile {
  name: string;
  mime: string;
  data: Buffer;
}

export const MEDIA_LABEL: Record<MediaKind, string> = {
  photo: '📷 Foto',
  video: '🎬 Video',
  file: '📎 Fayl',
  voice: '🎤 Ovozli xabar',
  audio: '🎵 Audio',
  sticker: '🙂 Stiker',
  gif: 'GIF',
  round: '⭕ Video xabar',
};

export interface Reaction {
  emoji: string;
  count: number;
  /** The signed-in user chose this one. */
  mine: boolean;
}

export type SharedKind = 'media' | 'files' | 'links';

export type ServiceKind = 'joined' | 'left' | 'created' | 'pinned' | 'title' | 'photo' | 'call' | 'cleared' | 'topic' | 'other';

export interface ReplyPreview {
  name?: string;
  text: string;
  out?: boolean;
  media?: MediaKind;
}

export interface Message {
  id: number;
  dialogId: string;
  text: string;
  date: number; // unix seconds
  out: boolean;
  read: boolean;
  senderName?: string;
  replyToId?: number;
  edited?: boolean;
  fwdFrom?: string;
  media?: MediaInfo;
  reactions?: Reaction[];
  /** Telegram's id of the sender (used for the small avatars next to group messages). */
  senderId?: string;
  /** Set instead of text for service messages ("X joined the group"). */
  service?: { kind: ServiceKind; name?: string; extra?: string };
  /** The replied-to message when it is not part of the same page of history. */
  reply?: ReplyPreview;
}

export interface Profile {
  id: string;
  kind: DialogKind;
  title: string;
  username?: string;
  phone?: string;
  bio?: string;
  online?: boolean;
  lastSeen?: number;
  members?: number;
}

export type TgEvent =
  | { type: 'dialog:update'; dialog: Dialog }
  | { type: 'message:new'; message: Message }
  | { type: 'message:edit'; message: Message }
  | { type: 'message:delete'; dialogId: string; ids: number[] }
  | { type: 'typing'; dialogId: string; name?: string; typing: boolean }
  | { type: 'read'; dialogId: string; maxId: number }
  | { type: 'status'; connected: boolean };

export class TgError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'TgError';
  }
}

export interface CallRecord {
  id: number;
  userId: string;
  name: string;
  date: number; // unix seconds
  out: boolean;
  missed: boolean;
  video: boolean;
  /** Seconds (0 for missed / declined calls). */
  duration: number;
}
