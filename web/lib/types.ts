export type AuthState = 'logged_out' | 'code_sent' | 'password_needed' | 'ready';
export type DialogKind = 'private' | 'group' | 'channel';

export interface Me {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone: string;
}

export type ServiceKind = 'joined' | 'left' | 'created' | 'pinned' | 'title' | 'photo' | 'call' | 'cleared' | 'topic' | 'other';

export interface LastMessage {
  text: string;
  date: number;
  out: boolean;
  read: boolean;
  sender?: string;
  media?: MediaKind;
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
  archived?: boolean;
  muted: boolean;
  online: boolean;
  photo?: boolean;
  pinOrder?: number;
  verified?: boolean;
  bot?: boolean;
  contact?: boolean;
}

/** A chat folder the user created in Telegram. */
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

export type Filter = 'all' | 'private' | 'group' | 'channel' | 'unread' | `folder:${number}`;

export type MediaKind = 'photo' | 'video' | 'file' | 'voice' | 'audio' | 'sticker' | 'gif' | 'round';

export interface MediaInfo {
  kind: MediaKind;
  name?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  alt?: string;
  thumb?: boolean;
}

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface Message {
  id: number;
  dialogId: string;
  text: string;
  date: number;
  out: boolean;
  read: boolean;
  senderName?: string;
  replyToId?: number;
  edited?: boolean;
  fwdFrom?: string;
  media?: MediaInfo;
  reactions?: Reaction[];
  senderId?: string;
  service?: { kind: ServiceKind; name?: string; extra?: string };
  reply?: { name?: string; text: string; out?: boolean; media?: MediaKind };
  /** Client-only: optimistic send state (negative id = not yet confirmed). */
  status?: 'sending' | 'failed';
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

export type PremiumState = 'none' | 'trial' | 'active' | 'expired';
export type Accent = 'blue' | 'green' | 'pink' | 'orange' | 'teal' | 'violet';

/** Premium of this app (trial / paid months); not Telegram's own Premium. */
export interface PremiumInfo {
  state: PremiumState;
  active: boolean;
  until?: number;
  daysLeft?: number;
  trialUsed: boolean;
  trialMonths: number;
  settings: { emojiStatus?: string; accent?: Accent };
  price: string;
  buyUrl?: string;
  uploadMb: { free: number; premium: number };
  accents: Accent[];
}

export interface CallRecord {
  id: number;
  userId: string;
  name: string;
  date: number;
  out: boolean;
  missed: boolean;
  video: boolean;
  duration: number;
}
