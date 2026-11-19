'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDialogTime } from '@/lib/format';
import { useProfile } from '@/lib/useProfile';
import type { Message } from '@/lib/types';
import { useChats, useSelectedDialog } from '@/store/chats';
import { useMessages } from '@/store/messages';
import { useSelection } from '@/store/selection';
import { useT, useUi } from '@/store/ui';
import { useUploads } from '@/store/uploads';
import { Avatar } from './Avatar';
import { ChatSearch } from './ChatSearch';
import { Composer } from './Composer';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { IconBell, IconBellOff, IconClose, IconForward, IconInfo, IconMore, IconPin, IconSearch, IconTrash } from './icons';
import { MessageList } from './MessageList';
import { stageFiles } from './stage';

const InfoPanel = dynamic(() => import('./InfoPanel').then((m) => m.InfoPanel), { ssr: false });
const UploadDialog = dynamic(() => import('./Attach').then((m) => m.UploadDialog), { ssr: false });
const DeleteDialog = dynamic(() => import('./Dialogs').then((m) => m.DeleteDialog), { ssr: false });
const ForwardDialog = dynamic(() => import('./Dialogs').then((m) => m.ForwardDialog), { ssr: false });

export function ChatPanel() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const dialog = useSelectedDialog();
  const infoOpen = useChats((s) => s.infoOpen);
  const [searching, setSearching] = useState(false);
  const [dots, setDots] = useState<{ x: number; y: number } | null>(null);
  const meId = useChats((s) => s.meId);
  const staged = useUploads((s) => s.staged.length > 0);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const typing = useChats((s) => (dialog ? !!s.typing[dialog.id] : false));
  const profile = useProfile(dialog?.id);
  const selIds = useSelection((s) => s.ids);
  const selecting = useSelection((s) => s.dialogId !== null && s.dialogId === dialog?.id);
  const thread = useMessages((s) => (dialog ? s.threads[dialog.id] : undefined));
  const [forwarding, setForwarding] = useState<Message[] | null>(null);
  const [deleting, setDeleting] = useState<Message[] | null>(null);

  const selected = useMemo(() => (thread?.items ?? []).filter((m) => selIds.includes(m.id)), [thread?.items, selIds]);

  // A different chat closes the in-chat search and any selection.
  const dialogId = dialog?.id;
  useEffect(() => {
    setSearching(false);
    setDots(null);
    useSelection.getState().clear();
  }, [dialogId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key !== 'Escape' || tag === 'TEXTAREA' || tag === 'INPUT') return;
      // Escape peels one layer at a time: selection first, then the chat.
      if (useSelection.getState().dialogId) useSelection.getState().clear();
      else useChats.getState().select(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!dialog) {
    return (
      <section className="wallpaper grid h-full w-full place-items-center p-6" aria-label="Chat">
        <div className="animate-rise rounded-3xl bg-surface/80 px-8 py-7 text-center backdrop-blur">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-accent/15 text-3xl" aria-hidden="true">
            💬
          </div>
          <p className="text-lg font-medium">{t('chat.select')}</p>
          <p className="mt-1 max-w-xs text-sm text-muted">{t('chat.selectSub')}</p>
        </div>
      </section>
    );
  }

  const isSaved = meId === dialog.id;
  const title = isSaved ? t('saved') : dialog.title;
  const online = !!(profile?.online ?? dialog.online);
  let subtitle = '';
  if (!isSaved) {
    if (typing) subtitle = t('chat.typing');
    else if (dialog.kind === 'private') subtitle = online ? t('chat.online') : profile?.lastSeen ? `${t('info.lastSeen')} ${formatDialogTime(profile.lastSeen, new Date(), lang)}` : '';
    else {
      const n = profile?.members;
      subtitle = n ? `${n.toLocaleString(lang)} ${dialog.kind === 'channel' ? t('chat.subscribers') : t('info.members')}` : dialog.kind === 'channel' ? t('chat.channel') : t('chat.group');
    }
  }
  const accentStatus = typing || (dialog.kind === 'private' && online);

  const menuItems: MenuItem[] = [
    { label: t('info.open'), icon: <IconInfo size={20} />, onSelect: () => useChats.getState().toggleInfo(true) },
    { label: dialog.muted ? t('menu.unmute') : t('menu.mute'), icon: dialog.muted ? <IconBell size={20} /> : <IconBellOff size={20} />, onSelect: () => void useChats.getState().toggleMute(dialog) },
    { label: dialog.pinned ? t('menu.unpin') : t('menu.pin'), icon: <IconPin size={20} />, onSelect: () => void useChats.getState().togglePin(dialog) },
    { label: t('menu.closeChat'), icon: <IconClose size={20} />, danger: true, onSelect: () => useChats.getState().select(null) },
  ];

  const iconBtn = 'grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink';

  return (
    <div className="flex h-full w-full min-w-0 animate-slide md:animate-none">
      <section
        className="relative flex h-full min-w-0 flex-1 flex-col"
        aria-label={dialog.title}
        onDragEnter={(e) => {
          if (dialog.kind === 'channel' || !e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          depth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          if (dialog.kind !== 'channel') stageFiles([...e.dataTransfer.files], t);
        }}
      >
        {selecting ? (
          <header className="pt-safe box-content flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3" data-testid="selection-bar">
            <button onClick={() => useSelection.getState().clear()} aria-label={t('selection.cancel')} className={iconBtn}>
              <IconClose size={24} />
            </button>
            <p className="flex-1 text-lg font-medium" aria-live="polite">
              {selIds.length} {t('selection.selected')}
            </p>
            <button
              onClick={() => setForwarding(selected)}
              disabled={selected.length === 0}
              className="flex h-10 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-medium text-accent transition hover:bg-accent/10 disabled:opacity-40"
            >
              <IconForward size={20} />
              {t('menu.forward')}
            </button>
            <button
              onClick={() => setDeleting(selected)}
              disabled={selected.length === 0}
              className="flex h-10 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
            >
              <IconTrash size={20} />
              {t('menu.delete')}
            </button>
          </header>
        ) : (
          <header className="pt-safe box-content flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
            <button onClick={() => useChats.getState().select(null)} aria-label={t('chat.back')} className={`${iconBtn} md:hidden`} data-ripple>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => useChats.getState().toggleInfo()}
              aria-label={t('info.open')}
              aria-expanded={infoOpen}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left"
            >
              <Avatar id={dialog.id} title={title} size={42} online={dialog.kind === 'private' && online} photo={dialog.photo} saved={isSaved} />
              <span className="min-w-0">
                <span className="block truncate text-base font-medium leading-tight">{title}</span>
                <span className={`block h-5 truncate text-sm leading-5 ${accentStatus ? 'text-accent' : 'text-muted'}`} aria-live="polite">
                  {subtitle}
                </span>
              </span>
            </button>
            <button
              data-ripple
              onClick={() => setSearching((v) => !v)}
              aria-label={t('chat.search')}
              aria-pressed={searching}
              title={t('chat.search')}
              className={`${iconBtn} ${searching ? '!text-accent' : ''}`}
            >
              <IconSearch size={24} />
            </button>
            <button
              data-ripple
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setDots({ x: r.right, y: r.bottom + 4 });
              }}
              aria-label={t('menu.more')}
              aria-haspopup="menu"
              title={t('menu.more')}
              className={iconBtn}
            >
              <IconMore size={24} />
            </button>
          </header>
        )}
        {searching && <ChatSearch dialog={dialog} onClose={() => setSearching(false)} />}
        <div className="wallpaper wallpaper-drift flex min-h-0 flex-1 flex-col">
          <MessageList key={dialog.id} dialog={dialog} />
        </div>
        <Composer dialog={dialog} />
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-accent/15 backdrop-blur-[2px]" aria-hidden="true">
            <div className="rounded-3xl border-2 border-dashed border-accent bg-surface/90 px-8 py-6 text-lg font-medium text-accent">{t('attach.drop')}</div>
          </div>
        )}
      </section>
      {staged && <UploadDialog dialog={dialog} />}
      {infoOpen && <InfoPanel key={dialog.id} dialog={dialog} />}
      {dots && <ContextMenu x={dots.x} y={dots.y} alignRight items={menuItems} onClose={() => setDots(null)} />}
      {forwarding && <ForwardDialog from={dialog} messages={forwarding} onClose={() => setForwarding(null)} onDone={() => useSelection.getState().clear()} />}
      {deleting && <DeleteDialog dialog={dialog} messages={deleting} onClose={() => setDeleting(null)} onDone={() => useSelection.getState().clear()} />}
    </div>
  );
}
