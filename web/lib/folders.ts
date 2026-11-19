import type { Dialog, Folder } from './types';

/** Does a chat belong to one of the user's Telegram folders? (same rules as Telegram's own clients) */
export function folderMatches(f: Folder, d: Dialog): boolean {
  if (d.archived) return false; // archived chats stay in the archive
  if (f.excludeIds.includes(d.id)) return false;
  if (f.includeIds.includes(d.id)) return true;
  const isPerson = d.kind === 'private' && !d.bot;
  const category =
    (f.contacts && isPerson && !!d.contact) ||
    (f.nonContacts && isPerson && !d.contact) ||
    (f.groups && d.kind === 'group') ||
    (f.broadcasts && d.kind === 'channel') ||
    (f.bots && !!d.bot);
  if (!category) return false;
  if (f.excludeMuted && d.muted) return false;
  if (f.excludeRead && d.unread === 0) return false;
  return true;
}

/** Number of chats with unread (non-muted) messages in a folder, the badge on the tab. */
export function folderUnread(f: Folder, dialogs: Dialog[]): number {
  return dialogs.reduce((n, d) => n + (d.unread > 0 && !d.muted && folderMatches(f, d) ? 1 : 0), 0);
}
