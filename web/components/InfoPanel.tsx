'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDialogTime } from '@/lib/format';
import type { Dialog, Profile } from '@/lib/types';
import { useChats } from '@/store/chats';
import { useT, useUi } from '@/store/ui';
import { Avatar } from './Avatar';
import { SharedTabs } from './SharedTabs';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; p: Profile };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3">
      <p className="select-text break-words">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

export function InfoPanel({ dialog }: { dialog: Dialog }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    api<Profile>(`/api/profile/${dialog.id}`)
      .then((p) => live && setState({ status: 'ready', p }))
      .catch(() => live && setState({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [dialog.id, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        useChats.getState().toggleInfo(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const p = state.status === 'ready' ? state.p : null;
  const status = p
    ? p.kind !== 'private'
      ? p.members
        ? `${p.members.toLocaleString(lang)} ${t('info.members')}`
        : ''
      : p.online
        ? t('chat.online')
        : p.lastSeen
          ? `${t('info.lastSeen')} ${formatDialogTime(p.lastSeen, new Date(), lang)}`
          : ''
    : '';

  return (
    <aside
      className="fixed inset-0 z-40 flex animate-rise flex-col bg-surface lg:static lg:inset-auto lg:z-auto lg:w-[22rem] lg:shrink-0 lg:border-l lg:border-line"
      aria-label={t('info.title')}
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button
          onClick={() => useChats.getState().toggleInfo(false)}
          aria-label={t('info.close')}
          className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <h2 className="font-semibold">{t('info.title')}</h2>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-5 py-6 text-center">
          <Avatar id={dialog.id} title={dialog.title} size={96} online={dialog.online} photo={dialog.photo} />
          <h3 className="mt-3 break-words text-xl font-bold">{p?.title ?? dialog.title}</h3>
          {state.status === 'loading' ? <div className="skeleton mt-2 h-4 w-28" /> : <p className={`mt-1 text-sm ${p?.online ? 'text-accent' : 'text-muted'}`}>{status}</p>}
        </div>

        {state.status === 'error' && (
          <div className="px-5 text-center">
            <p className="text-sm">{t('info.error')}</p>
            <button onClick={() => setAttempt((n) => n + 1)} className="mt-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink hover:brightness-110">
              {t('chats.retry')}
            </button>
          </div>
        )}
        {state.status === 'loading' && (
          <div className="space-y-4 px-5" aria-hidden="true">
            <div className="skeleton h-4 w-3/5" />
            <div className="skeleton h-4 w-2/5" />
            <div className="skeleton h-4 w-4/5" />
          </div>
        )}
        {p && (
          <div className="divide-y divide-line">
            {p.phone && <Field label={t('info.phone')} value={p.phone} />}
            {p.username && <Field label={t('info.username')} value={`@${p.username}`} />}
            {p.bio && <Field label={t('info.bio')} value={p.bio} />}
          </div>
        )}
        <SharedTabs dialogId={dialog.id} />
      </div>
    </aside>
  );
}
