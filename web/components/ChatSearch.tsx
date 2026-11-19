'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { highlightParts } from '@/lib/social';
import { plainText } from '@/lib/richtext';
import type { Dialog, Message } from '@/lib/types';
import { useMessages } from '@/store/messages';
import { useT } from '@/store/ui';

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: Message[]; hasMore: boolean };

/** Search inside the open chat; picking a result scrolls to (and loads, if needed) that message. */
export function ChatSearch({ dialog, onClose }: { dialog: Dialog; onClose: () => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });
  const token = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      token.current++;
      return setState({ status: 'idle' });
    }
    const my = ++token.current;
    setState({ status: 'loading' });
    const id = setTimeout(() => {
      api<{ items: Message[]; hasMore: boolean }>(`/api/dialogs/${dialog.id}/search?q=${encodeURIComponent(term)}&limit=30`)
        .then((r) => my === token.current && setState({ status: 'ready', ...r }))
        .catch(() => my === token.current && setState({ status: 'error' }));
    }, 300);
    return () => clearTimeout(id);
  }, [q, dialog.id]);

  const go = async (m: Message) => {
    onClose();
    await useMessages.getState().jumpTo(dialog.id, m.id);
  };

  const fmt = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });

  return (
    <div className="relative z-20 border-b border-line bg-surface" role="search">
      <div className="flex items-center gap-2 px-3 py-2">
        <svg className="shrink-0 text-muted" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onClose();
            }
          }}
          placeholder={t('search.inChat')}
          aria-label={t('search.inChat')}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted"
        />
        <button onClick={onClose} aria-label={t('search.close')} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink">
          ✕
        </button>
      </div>
      {state.status !== 'idle' && (
        <div className="scroll-thin absolute inset-x-0 top-full max-h-80 overflow-y-auto border-b border-line bg-surface shadow-xl" aria-live="polite">
          {state.status === 'loading' && <p className="px-4 py-4 text-sm text-muted">…</p>}
          {state.status === 'error' && <p className="px-4 py-4 text-sm text-danger">{t('chats.error')}</p>}
          {state.status === 'ready' && state.items.length === 0 && <p className="px-4 py-4 text-sm text-muted">{t('search.noMatches')}</p>}
          {state.status === 'ready' && (
            <ul>
              {state.items.map((m) => (
                <li key={m.id}>
                  <button onClick={() => void go(m)} data-testid="search-hit" className="flex w-full flex-col gap-0.5 border-b border-line/60 px-4 py-2.5 text-left transition hover:bg-raised">
                    <span className="flex justify-between gap-3 text-xs text-muted">
                      <span className="truncate font-semibold text-accent">{m.out ? '✓' : (m.senderName ?? dialog.title)}</span>
                      <span className="shrink-0">{fmt(m.date)}</span>
                    </span>
                    <span className="line-clamp-2 text-sm">
                      {highlightParts(plainText(m.text), q).map((p, i) =>
                        p.hit ? (
                          <mark key={i} className="rounded bg-accent/25 px-0.5 text-inherit">
                            {p.text}
                          </mark>
                        ) : (
                          <span key={i}>{p.text}</span>
                        ),
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
