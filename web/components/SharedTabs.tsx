'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatBytes, formatDialogTime } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import type { Message } from '@/lib/types';
import { useT, useUi } from '@/store/ui';
import { IconDownload, IconPlay } from './icons';
import { Lightbox } from './Lightbox';

type Kind = 'media' | 'files' | 'links';
interface Slot {
  items: Message[];
  hasMore: boolean;
  status: 'idle' | 'loading' | 'error' | 'ready';
}
const EMPTY: Slot = { items: [], hasMore: false, status: 'idle' };
const KINDS: Kind[] = ['media', 'files', 'links'];
const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** Media / Files / Links of a chat, like the tabs at the bottom of Telegram's profile panel. */
export function SharedTabs({ dialogId }: { dialogId: string }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [kind, setKind] = useState<Kind>('media');
  const [slots, setSlots] = useState<Record<Kind, Slot>>({ media: EMPTY, files: EMPTY, links: EMPTY });
  const [open, setOpen] = useState<Message | null>(null);
  const token = useRef(0);

  // A different chat: start over.
  useEffect(() => {
    token.current++;
    setSlots({ media: EMPTY, files: EMPTY, links: EMPTY });
    setKind('media');
  }, [dialogId]);

  const load = useCallback(
    async (k: Kind, more: boolean) => {
      const my = token.current;
      let before: number | undefined;
      setSlots((s) => {
        before = more ? s[k].items.at(-1)?.id : undefined;
        return { ...s, [k]: { ...s[k], status: 'loading' } };
      });
      try {
        const q = new URLSearchParams({ kind: k, limit: '30' });
        if (more && before) q.set('beforeId', String(before));
        const r = await api<{ items: Message[]; hasMore: boolean }>(`/api/dialogs/${dialogId}/shared?${q}`);
        if (my !== token.current) return;
        setSlots((s) => ({ ...s, [k]: { items: more ? [...s[k].items, ...r.items] : r.items, hasMore: r.hasMore, status: 'ready' } }));
      } catch {
        if (my === token.current) setSlots((s) => ({ ...s, [k]: { ...s[k], status: 'error' } }));
      }
    },
    [dialogId],
  );

  const slot = slots[kind];
  useEffect(() => {
    if (slots[kind].status === 'idle') void load(kind, false);
  }, [kind, slots, load]);

  const label: Record<Kind, string> = { media: t('sh.media'), files: t('sh.files'), links: t('sh.links') };

  return (
    <div className="mt-2 border-t-8 border-raised" data-testid="shared">
      <div role="tablist" aria-label={t('info.title')} className="sticky top-0 z-10 flex border-b border-line bg-surface">
        {KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={`relative h-12 flex-1 text-sm font-medium transition-colors ${kind === k ? 'text-accent' : 'text-muted hover:text-ink'}`}
          >
            {label[k]}
            {kind === k && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-accent" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={label[kind]}>
        {kind === 'media' && slot.items.length > 0 && (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {slot.items.map((m) => (
              <button
                key={m.id}
                onClick={() => (m.media?.kind === 'video' ? window.open(mediaUrl(m.dialogId, m.id), '_blank', 'noopener,noreferrer') : setOpen(m))}
                aria-label={m.media?.name ?? label.media}
                className="relative aspect-square overflow-hidden bg-raised"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(m.dialogId, m.id, { thumb: true })} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                {m.media?.kind === 'video' && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white">
                      <IconPlay size={18} />
                    </span>
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {kind === 'files' &&
          slot.items.map((m) => (
            <a
              key={m.id}
              href={mediaUrl(m.dialogId, m.id, { download: true })}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
                <IconDownload size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-medium">{m.media?.name ?? label.files}</span>
                <span className="block truncate text-sm text-muted">
                  {[m.media?.size ? formatBytes(m.media.size) : '', formatDialogTime(m.date, new Date(), lang)].filter(Boolean).join(' · ')}
                </span>
              </span>
            </a>
          ))}

        {kind === 'links' &&
          slot.items.map((m) => {
            const url = URL_RE.exec(m.text)?.[0] ?? '';
            return (
              <div key={m.id} className="px-4 py-2.5">
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="block break-all text-[0.9375rem] font-medium text-accent hover:underline">
                    {url}
                  </a>
                ) : null}
                <p className="line-clamp-2 break-words text-sm text-muted">{m.text.replace(url, '').trim() || formatDialogTime(m.date, new Date(), lang)}</p>
              </div>
            );
          })}

        {slot.status === 'loading' && (
          <div className="space-y-3 p-4" aria-hidden="true">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-4/5" />
          </div>
        )}
        {slot.status === 'ready' && slot.items.length === 0 && <p className="py-10 text-center text-sm text-muted">{t('sh.empty')}</p>}
        {slot.status === 'error' && (
          <div className="py-8 text-center">
            <p className="text-sm">{t('chats.error')}</p>
            <button onClick={() => void load(kind, false)} className="mt-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink hover:brightness-110">
              {t('chats.retry')}
            </button>
          </div>
        )}
        {slot.status === 'ready' && slot.hasMore && (
          <button onClick={() => void load(kind, true)} className="w-full py-3 text-sm font-medium text-accent transition-colors hover:bg-raised">
            {t('sh.more')}
          </button>
        )}
      </div>
      {open && <Lightbox m={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
