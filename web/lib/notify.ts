import { MEDIA_EMOJI } from './media';
import { plainText } from './richtext';
import type { Dialog, Message } from './types';

export interface NotifyInput {
  out: boolean;
  muted: boolean;
  enabled: boolean;
  dialogId: string;
  selectedId: string | null;
  /** The tab is visible AND focused. */
  attentive: boolean;
}

/** Notify for incoming, un-muted messages unless the user is already looking at that very chat. */
export function shouldNotify(i: NotifyInput): boolean {
  if (i.out || i.muted || !i.enabled) return false;
  return !(i.attentive && i.dialogId === i.selectedId);
}

export function notificationText(d: Dialog | undefined, m: Message, showText: boolean, fallbackTitle: string): { title: string; body: string } {
  const title = d?.title ?? m.senderName ?? fallbackTitle;
  if (!showText) return { title, body: '…' };
  const who = d?.kind === 'group' && m.senderName ? `${m.senderName}: ` : '';
  const media = m.media ? `${MEDIA_EMOJI[m.media.kind] ?? '📎'} ` : '';
  return { title, body: `${who}${media}${plainText(m.text)}`.trim().slice(0, 140) || '…' };
}

let ctx: AudioContext | null = null;

/** Soft two-note chime generated with WebAudio (no asset to ship or cache). */
export function playChime() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.12, now + i * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.11 + 0.22);
      o.connect(g).connect(ctx!.destination);
      o.start(now + i * 0.11);
      o.stop(now + i * 0.11 + 0.25);
    });
  } catch {
    /* autoplay policy or no audio device: stay silent */
  }
}

export function badgeTitle(base: string, unread: number): string {
  return unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base}` : base;
}
