'use client';
import { memo, useRef } from 'react';
import { nameColor } from '@/lib/format';
import { timeLabel } from '@/lib/messages';
import { firstUrl, plainText } from '@/lib/richtext';
import { emojiOnlyCount } from '@/lib/social';
import type { Message } from '@/lib/types';
import { Avatar } from './Avatar';
import { IconCheck, IconDoubleCheck } from './icons';
import { LinkPreview } from './LinkPreview';
import { MediaView } from './MediaView';
import { RichText } from './RichText';

export interface Quote {
  id: number;
  name: string;
  text: string;
}

interface Props {
  m: Message;
  first: boolean;
  last: boolean;
  showSender: boolean;
  quote: Quote | null;
  labels: { edited: string; fwd: string; failed: string; retry: string; sending: string; deleted: string; select: string };
  /** Group chats: the sender's small avatar next to the last message of a run. */
  avatar: { id: string; title: string; photo: boolean } | null;
  /** "Unread messages" line drawn above this message. */
  unreadDivider?: string;
  selecting: boolean;
  selected: boolean;
  onToggle: (m: Message) => void;
  onMenu: (m: Message, x: number, y: number) => void;
  onRetry: (m: Message) => void;
  onJump: (id: number) => void;
  onOpenMedia: (m: Message) => void;
  onReact: (m: Message, emoji: string | null) => void;
}

export const MessageBubble = memo(function MessageBubble({ m, first, last, showSender, quote, labels, avatar, unreadDivider, selecting, selected, onToggle, onMenu, onRetry, onJump, onOpenMedia, onReact }: Props) {
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };

  const big = !m.media && !m.replyToId && !m.fwdFrom ? emojiOnlyCount(m.text) : 0; // 1-3 emoji are shown large, no bubble
  const link = m.media || !m.text ? null : firstUrl(m.text);
  const sticker = m.media?.kind === 'sticker' && !m.text;
  const bare = sticker || m.media?.kind === 'round' || big > 0; // stickers / big emoji float without a bubble
  // Photos / videos / GIFs run edge to edge inside the bubble.
  const visual = !!m.media && ['photo', 'video', 'gif'].includes(m.media.kind);
  const hasBody = !!m.text || m.replyToId !== undefined || !!m.fwdFrom || !!m.reactions || (showSender && !m.out && first && !!m.senderName);
  const overlayTime = visual && !hasBody; // time sits on the picture as a pill
  const tail = last && !bare;

  const radius = `rounded-t-xl ${last ? (m.out ? 'rounded-bl-xl rounded-br-[4px]' : 'rounded-bl-[4px] rounded-br-xl') : 'rounded-b-xl'}`;

  const ticks = m.status === 'sending' ? '🕓' : m.status === 'failed' ? '⚠' : null;
  const meta = (
    <span
      className={`msg-meta inline-flex select-none items-center gap-1 text-xs leading-none ${
        overlayTime
          ? 'absolute bottom-1.5 right-1.5 rounded-full bg-black/45 px-2 py-1 !text-white'
          : bare
            ? 'mt-1 w-fit rounded-full bg-black/35 px-2 py-1 !text-white'
            : m.media && !m.text
              ? 'mt-1 float-right'
              : 'float-right ml-3 mt-1.5'
      }`}
    >
      {m.edited && <span>{labels.edited}</span>}
      {timeLabel(m.date)}
      {m.out && (
        <span aria-label={m.status === 'sending' ? labels.sending : m.read ? 'read' : 'sent'} className="inline-flex">
          {ticks ?? (m.read ? <IconDoubleCheck size={16} strokeWidth={2} /> : <IconCheck size={16} strokeWidth={2} />)}
        </span>
      )}
    </span>
  );

  const bubbleCls = bare
    ? 'rounded-2xl px-1 py-0.5'
    : `bubble ${m.out ? 'bubble-out' : 'bubble-in'} ${radius} ${tail ? `tail ${m.out ? 'tail-out' : 'tail-in'}` : ''} ${visual ? 'p-0' : 'px-2.5 py-1.5'}`;

  return (
    <>
      {unreadDivider && (
        <div data-testid="unread-divider" data-unread-divider className="-mx-3 my-2 bg-black/20 py-1 text-center text-sm font-medium text-white backdrop-blur-sm md:-mx-6">
          {unreadDivider}
        </div>
      )}
    <div
      id={`msg-${m.id}`}
      data-testid="msg"
      data-mid={m.id}
      data-selected={selected || undefined}
      onClickCapture={(e) => {
        if (!selecting || m.id <= 0) return;
        e.preventDefault();
        e.stopPropagation();
        onToggle(m);
      }}
      className={`relative flex ${m.out ? 'justify-end' : 'justify-start'} ${first ? 'mt-2' : 'mt-0.5'} ${m.status === 'sending' ? 'animate-msg' : ''} ${selecting ? 'cursor-pointer !pl-12 md:!pl-14' : ''} ${selected ? 'bg-accent/15' : ''} -mx-3 px-3 md:-mx-6 md:px-6`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 44px' }}
    >
      {selecting && m.id > 0 && (
        <span
          role="checkbox"
          aria-checked={selected}
          aria-label={labels.select}
          className={`absolute left-3 top-1/2 grid h-[22px] w-[22px] -translate-y-1/2 place-items-center rounded-full border-2 transition md:left-5 ${
            selected ? 'border-accent bg-accent text-accent-ink' : 'border-white/80 bg-black/20 text-transparent'
          }`}
        >
          <IconCheck size={14} strokeWidth={3} />
        </span>
      )}
      {avatar && (
        <div className="mr-1.5 flex w-9 shrink-0 items-end" aria-hidden="true">
          {last && <Avatar id={avatar.id} title={avatar.title} size={36} photo={avatar.photo} />}
        </div>
      )}
      <div
        tabIndex={0}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu(m, e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(m, r.left + 24, r.top + r.height / 2);
          }
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (!t) return;
          const { clientX, clientY } = t;
          cancel();
          press.current = setTimeout(() => onMenu(m, clientX, clientY), 500);
        }}
        onTouchMove={cancel}
        onTouchEnd={cancel}
        onTouchCancel={cancel}
        className={`relative max-w-[85%] select-text whitespace-pre-wrap break-words text-base leading-[1.3125] md:max-w-[min(70%,32rem)] ${bubbleCls} ${m.status === 'sending' ? 'opacity-70' : ''} ${selecting ? 'pointer-events-none' : ''}`}
      >
        {m.media && visual && (
          <div className={`relative overflow-hidden rounded-t-[inherit] ${hasBody ? '' : 'rounded-b-[inherit]'}`}>
            <MediaView m={m} onOpen={onOpenMedia} />
            {overlayTime && meta}
          </div>
        )}
        <div className={visual && hasBody ? 'px-2.5 pb-1.5 pt-1.5' : visual ? 'hidden' : ''}>
          {showSender && !m.out && first && m.senderName && (
            <p className="mb-0.5 text-sm font-medium" style={{ color: nameColor(m.senderName) }}>
              {m.senderName}
            </p>
          )}
          {m.fwdFrom && (
            <p className="quote-name mb-0.5 text-sm font-medium">
              ↪ {labels.fwd}: {m.fwdFrom}
            </p>
          )}
          {m.replyToId !== undefined && (
            <button type="button" onClick={() => onJump(m.replyToId!)} className="quote mb-1 block w-full rounded-md px-2 py-1 text-left text-sm">
              <span className="quote-name block truncate text-sm font-medium">{quote?.name ?? labels.deleted}</span>
              <span className="block truncate opacity-80">{quote ? plainText(quote.text) : '…'}</span>
            </button>
          )}
          {m.media && !visual && (
            <div className={m.text ? 'mb-1' : ''}>
              <MediaView m={m} onOpen={onOpenMedia} />
            </div>
          )}
          {big > 0 ? (
            <span className={big === 1 ? 'text-6xl leading-tight' : big === 2 ? 'text-5xl leading-tight' : 'text-4xl leading-tight'}>{m.text.trim()}</span>
          ) : (
            m.text && <RichText text={m.text} />
          )}
          {link && <LinkPreview url={link} />}
          {m.reactions && (
            <div className="mt-1 flex flex-wrap gap-1" data-testid="reactions">
              {m.reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  aria-pressed={r.mine}
                  aria-label={`${r.emoji} ${r.count}`}
                  onClick={() => onReact(m, r.mine ? null : r.emoji)}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-sm transition active:scale-95 ${
                    r.mine ? 'bg-accent text-accent-ink' : 'bg-black/10 hover:bg-black/15 dark:bg-white/15 dark:hover:bg-white/20'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="text-xs font-medium">{r.count}</span>
                </button>
              ))}
            </div>
          )}
          {!overlayTime && meta}
        </div>
        {m.status === 'failed' && (
          <button onClick={() => onRetry(m)} className="m-1 block rounded-md bg-black/20 px-2 py-1 text-left text-xs font-medium">
            {labels.failed} · {labels.retry}
          </button>
        )}
      </div>
    </div>
    </>
  );
});