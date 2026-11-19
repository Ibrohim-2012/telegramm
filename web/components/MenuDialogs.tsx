'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatDialogTime } from '@/lib/format';
import type { CallRecord, Dialog, Me } from '@/lib/types';
import { useChats } from '@/store/chats';
import { toastError } from '@/store/messages';
import { usePremium } from '@/store/premium';
import { useToast } from '@/store/toast';
import { useT, useUi } from '@/store/ui';
import { Avatar } from './Avatar';
import { IconCheck, IconPhoneIn, IconPhoneOut, IconStar } from './icons';
import { Modal } from './Modal';

const field = 'h-11 w-full rounded-xl bg-raised px-3.5 text-base outline-none ring-1 ring-transparent transition focus:ring-accent';

/** "Mening profilim": the account's own data. */
export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const premium = usePremium((s) => s.info);
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let live = true;
    api<Me>('/api/me').then((m) => live && setMe(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const name = me ? [me.firstName, me.lastName].filter(Boolean).join(' ') : '';
  const row = (label: string, value?: string) => (
    <div className="border-t border-line py-2.5 first:border-0">
      <p className="text-base">{value || <span className="text-muted">{t('profile.none')}</span>}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
  return (
    <Modal title={t('profile.title')} onClose={onClose}>
      <div className="flex flex-col items-center gap-2 pb-3" data-testid="my-profile">
        <Avatar id={me?.id ?? 'me'} title={name || '?'} size={88} photo />
        {me ? (
          <p className="flex items-center gap-1.5 text-lg font-bold">
            {name}
            {premium?.active && (premium.settings.emojiStatus ? <span>{premium.settings.emojiStatus}</span> : <IconStar size={18} />)}
          </p>
        ) : (
          <div className="skeleton h-5 w-36" aria-hidden="true" />
        )}
      </div>
      {row(t('profile.phone'), me?.phone)}
      {row(t('profile.username'), me?.username ? `@${me.username}` : undefined)}
      <button onClick={onClose} className="mt-3 w-full rounded-xl bg-raised py-2.5 font-medium transition hover:brightness-95">
        {t('media.close')}
      </button>
    </Modal>
  );
}

function openDialog(d: Dialog) {
  const st = useChats.getState();
  st.applyUpdate(d);
  st.select(d.id);
}

/** Create a group: name + members picked from your private chats. */
export function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const dialogs = useChats((s) => s.dialogs);
  const meId = useChats((s) => s.meId);
  const [title, setTitle] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return dialogs
      .filter((d) => d.kind === 'private' && d.id !== meId && !d.bot && (!needle || d.title.toLowerCase().includes(needle)))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 80);
  }, [dialogs, meId, q]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const can = title.trim().length > 0 && picked.length > 0 && !busy;
  const create = async () => {
    if (!can) return;
    setBusy(true);
    try {
      const d = await api<Dialog>('/api/groups', { body: { title: title.trim(), userIds: picked } });
      onClose();
      openDialog(d);
      useToast.getState().show(t('grp.created'));
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal title={t('grp.title')} onClose={onClose}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={128} placeholder={t('grp.name')} aria-label={t('grp.name')} className={field} />
      <p className="mb-1.5 mt-3 text-sm font-semibold text-accent">
        {t('grp.members')} {picked.length > 0 && `· ${picked.length}`}
      </p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('forward.search')} aria-label={t('forward.search')} className={`${field} mb-1.5 !h-10`} />
      <ul className="scroll-thin -mr-2 max-h-60 overflow-y-auto pr-2">
        {people.map((d) => {
          const on = picked.includes(d.id);
          return (
            <li key={d.id}>
              <button role="checkbox" aria-checked={on} onClick={() => toggle(d.id)} className="flex h-14 w-full items-center gap-3 rounded-xl px-2 text-left transition hover:bg-raised">
                <span className="relative">
                  <Avatar id={d.id} title={d.title} size={40} photo={d.photo} />
                  {on && (
                    <span className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-accent text-accent-ink ring-2 ring-surface">
                      <IconCheck size={12} />
                    </span>
                  )}
                </span>
                <span className="truncate font-medium">{d.title}</span>
              </button>
            </li>
          );
        })}
        {people.length === 0 && <li className="py-6 text-center text-sm text-muted">{t('contacts.empty')}</li>}
      </ul>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-muted transition hover:text-ink">
          {t('compose.cancel')}
        </button>
        <button onClick={() => void create()} disabled={!can} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50">
          {t('grp.create')}
        </button>
      </div>
    </Modal>
  );
}

export function CreateChannelDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);
  const can = title.trim().length > 0 && !busy;
  const create = async () => {
    if (!can) return;
    setBusy(true);
    try {
      const d = await api<Dialog>('/api/channels', { body: { title: title.trim(), about: about.trim() || undefined } });
      onClose();
      openDialog(d);
      useToast.getState().show(t('ch.created'));
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal title={t('ch.title')} onClose={onClose}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={128} placeholder={t('ch.name')} aria-label={t('ch.name')} className={field} />
      <textarea
        value={about}
        onChange={(e) => setAbout(e.target.value)}
        maxLength={255}
        rows={3}
        placeholder={t('ch.about')}
        aria-label={t('ch.about')}
        className="mt-3 w-full resize-none rounded-xl bg-raised px-3.5 py-2.5 text-base outline-none ring-1 ring-transparent transition focus:ring-accent"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold text-muted transition hover:text-ink">
          {t('compose.cancel')}
        </button>
        <button onClick={() => void create()} disabled={!can} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50">
          {t('grp.create')}
        </button>
      </div>
    </Modal>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Call history (read only: the browser cannot place calls). */
export function CallsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [items, setItems] = useState<CallRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ items: CallRecord[] }>('/api/calls')
      .then((r) => live && setItems(r.items))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  const open = (c: CallRecord) => {
    onClose();
    const st = useChats.getState();
    if (st.dialogs.some((d) => d.id === c.userId)) st.select(c.userId);
    else st.selectPeer({ id: c.userId, kind: 'private', title: c.name, unread: 0, pinned: false, muted: false, online: false });
  };
  return (
    <Modal title={t('calls.title')} onClose={onClose}>
      <ul className="scroll-thin -mr-2 max-h-80 overflow-y-auto pr-2" data-testid="calls-list">
        {items === null && !failed && [0, 1, 2].map((i) => <li key={i} className="skeleton my-2 h-10 w-full" aria-hidden="true" />)}
        {items?.map((c) => (
          <li key={c.id}>
            <button data-ripple onClick={() => open(c)} className="flex h-[60px] w-full items-center gap-3 rounded-xl px-2 text-left transition hover:bg-raised">
              <Avatar id={c.userId} title={c.name} size={42} photo />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-base font-medium ${c.missed && !c.out ? 'text-danger' : ''}`}>{c.name}</span>
                <span className={`flex items-center gap-1 truncate text-sm ${c.missed && !c.out ? 'text-danger' : 'text-muted'}`}>
                  {c.out ? <IconPhoneOut size={14} /> : <IconPhoneIn size={14} />}
                  {c.missed ? t('calls.missed') : c.out ? t('calls.outgoing') : t('calls.incoming')}
                  {c.video && ` · ${t('calls.video')}`}
                  {!c.missed && c.duration > 0 && ` · ${mmss(c.duration)}`}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted">{formatDialogTime(c.date, new Date(), lang)}</span>
            </button>
          </li>
        ))}
        {items?.length === 0 && <li className="py-8 text-center text-sm text-muted">{t('calls.empty')}</li>}
        {failed && <li className="py-8 text-center text-sm text-danger">{t('chats.error')}</li>}
      </ul>
      <p className="mt-2 text-xs text-muted">{t('calls.note')}</p>
    </Modal>
  );
}
