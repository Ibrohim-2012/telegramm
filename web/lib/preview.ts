import type { Key } from './i18n';
import { MEDIA_EMOJI } from './media';
import { plainText } from './richtext';
import type { Dialog, MediaKind, Message, ServiceKind } from './types';

type T = (key: Key) => string;

/** "📷 Photo", "🎤 Voice message"... */
export function mediaLabel(kind: MediaKind, t: T): string {
  return `${MEDIA_EMOJI[kind] ?? '📎'} ${t(`mt.${kind}` as Key)}`;
}

export function serviceText(kind: ServiceKind, name: string | undefined, extra: string | undefined, t: T): string {
  const verb = t(`sv.${kind}` as Key);
  if (kind === 'call' || kind === 'other' || kind === 'cleared') return verb;
  const who = name ? `${name} ` : '';
  return kind === 'created' && extra ? `${who}${verb} «${extra}»` : kind === 'title' && extra ? `${who}${verb}: «${extra}»` : `${who}${verb}`;
}

/** What the last message of a chat looks like in the list (Telegram's "Name: text" / "Photo, caption" rules). */
export function dialogPreview(d: Dialog, t: T): { prefix?: { text: string; you: boolean }; body: string } {
  const lm = d.lastMessage;
  if (!lm) return { body: d.username ? `@${d.username}` : '' };
  if (lm.service) return { body: serviceText(lm.service, lm.sender, undefined, t) };
  const caption = plainText(lm.text);
  const body = lm.media ? (caption ? `${mediaLabel(lm.media, t)}, ${caption}` : mediaLabel(lm.media, t)) : caption;
  if (lm.out) return { prefix: { text: `${t('you')}:`, you: true }, body };
  if (lm.sender && d.kind === 'group') return { prefix: { text: `${lm.sender}:`, you: false }, body };
  return { body };
}

/** Text shown inside a reply quote / forwarded preview (media-only messages get their label). */
export function quoteBody(text: string, media: MediaKind | undefined, t: T): string {
  const plain = plainText(text);
  return plain || (media ? mediaLabel(media, t) : '');
}

export function previewOfMessage(m: Message, t: T): string {
  return quoteBody(m.text, m.media?.kind, t);
}
