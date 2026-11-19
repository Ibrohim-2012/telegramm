'use client';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDialogTime } from '@/lib/format';
import { dialogPreview } from '@/lib/preview';
import type { Dialog } from '@/lib/types';
import { selectVisible, useChats } from '@/store/chats';
import { useT, useUi } from '@/store/ui';
import { useDrafts } from '@/store/drafts';
import { Avatar } from './Avatar';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { IconArchive, IconBack, IconBell, IconBellOff, IconCheck, IconDoubleCheck, IconPin, IconVerified } from './icons';

const ROW_H = 72;
const HEAD_H = 36;

type Row =
  | { type: 'dialog'; d: Dialog; global: boolean }
  | { type: 'head'; label: string }
  | { type: 'archive'; count: number; unread: number }
  | { type: 'archiveBack' }
  | { type: 'info'; text: string; busy?: boolean };

function Skeletons() {
  // Same geometry as a real row so nothing jumps when the list arrives.
  const widths = [['42%', '70%'], ['55%', '48%'], ['36%', '82%'], ['48%', '60%'], ['60%', '75%'], ['40%', '52%'], ['52%', '66%'], ['34%', '78%'], ['46%', '58%'], ['58%', '44%']];
  return (
    <div className="px-2" aria-hidden="true">
      {widths.map(([a, b], i) => (
        <div key={i} className="flex h-[72px] items-center gap-3 px-2.5">
          <div className="skeleton h-[54px] w-[54px] shrink-0 !rounded-full" />
          <div className="flex-1 space-y-2.5">
            <div className="flex justify-between gap-6">
              <div className="skeleton h-4" style={{ width: a }} />
              <div className="skeleton h-3 w-9" />
            </div>
            <div className="skeleton h-3.5" style={{ width: b }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DialogRow({ d, active, lang, onOpen, onMenu }: { d: Dialog; active: boolean; lang: string; onOpen: () => void; onMenu: (d: Dialog, x: number, y: number) => void }) {
  const t = useT();
  const typing = useChats((s) => !!s.typing[d.id]);
  const isSaved = useChats((s) => s.meId === d.id);
  const draft = useDrafts((s) => s.drafts[d.id]);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lm = d.lastMessage;
  const showDraft = !!draft && !active;
  const preview = dialogPreview(d, t);
  const title = isSaved ? t('saved') : d.title;
  return (
    <button
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(d, e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu(d, r.left + 40, r.top + r.height / 2);
        }
      }}
      onTouchStart={(e) => {
        const tt = e.touches[0];
        if (!tt) return;
        const { clientX, clientY } = tt;
        if (press.current) clearTimeout(press.current);
        press.current = setTimeout(() => onMenu(d, clientX, clientY), 550);
      }}
      onTouchMove={() => press.current && clearTimeout(press.current)}
      onTouchEnd={() => press.current && clearTimeout(press.current)}
      aria-current={active ? 'true' : undefined}
      data-ripple
      className={`flex h-[72px] w-full items-center gap-3 rounded-xl px-2.5 text-left transition ${active ? 'bg-accent text-accent-ink' : 'hover:bg-raised'}`}
    >
      <Avatar id={d.id} title={title} online={d.online} photo={d.photo} saved={isSaved} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-base font-medium">{title}</span>
          {d.verified && <IconVerified size={16} className="shrink-0 self-center" aria-label="verified" role="img" aria-hidden={false} />}
          {d.muted && (
            <span className={`shrink-0 self-center ${active ? 'opacity-80' : 'text-muted'}`} title="muted">
              <IconBellOff size={15} />
            </span>
          )}
          {lm && (
            <span className={`ml-auto flex shrink-0 items-center gap-1 text-xs ${active ? 'opacity-90' : 'text-muted'}`}>
              {lm.out && (
                <span className={active ? '' : 'text-badge-on'} aria-label={lm.read ? 'read' : 'sent'}>
                  {lm.read ? <IconDoubleCheck size={17} strokeWidth={2} /> : <IconCheck size={17} strokeWidth={2} />}
                </span>
              )}
              {formatDialogTime(lm.date, new Date(), lang)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={`truncate text-[0.9375rem] ${typing ? (active ? 'font-medium' : 'font-medium text-accent') : active ? 'opacity-90' : 'text-muted'}`}>{typing ? (<>{t('chat.typingShort')}<span className="typing-dots" aria-hidden="true"><i /><i /><i /></span></>) : showDraft ? (<><span className="text-danger">{t('draft')}: </span>{draft.replace(/\s+/g, ' ')}</>) : (<>{preview.prefix && <span className={active || !preview.prefix.you ? '' : 'text-accent'}>{preview.prefix.text} </span>}{preview.body}</>)}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {d.pinned && d.unread === 0 && (
              <IconPin size={18} className={active ? '' : 'text-muted'} aria-label="pinned" aria-hidden={false} role="img" />
            )}
            {d.unread > 0 && (
              <span
                className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-medium leading-none ${
                  active ? 'bg-accent-ink text-accent' : d.muted ? 'bg-badge text-white' : 'bg-badge-on text-white'
                }`}
              >
                {d.unread}
              </span>
            )}
          </span>
        </div>
      </div>
    </button>
  );
}

function dialogMenuItems(d: Dialog, t: ReturnType<typeof useT>): MenuItem[] {
  const st = useChats.getState();
  const items: MenuItem[] = [
    { label: d.pinned ? t('menu.unpin') : t('menu.pin'), icon: <IconPin size={20} />, onSelect: () => void st.togglePin(d) },
    { label: d.archived ? t('menu.unarchive') : t('menu.archive'), icon: <IconArchive size={20} />, onSelect: () => void st.toggleArchive(d) },
    { label: d.muted ? t('menu.unmute') : t('menu.mute'), icon: d.muted ? <IconBell size={20} /> : <IconBellOff size={20} />, onSelect: () => void st.toggleMute(d) },
  ];
  if (d.unread > 0) items.push({ label: t('menu.markRead'), icon: <IconCheck size={20} />, onSelect: () => void st.markAllRead(d) });
  return items;
}

export function ChatList() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const dialogs = useChats((s) => s.dialogs);
  const filter = useChats((s) => s.filter);
  const query = useChats((s) => s.query);
  const status = useChats((s) => s.status);
  const hasMore = useChats((s) => s.hasMore);
  const loadingMore = useChats((s) => s.loadingMore);
  const selectedId = useChats((s) => s.selectedId);
  const global = useChats((s) => s.global);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; d: Dialog } | null>(null);
  const openMenu = useCallback((d: Dialog, x: number, y: number) => setMenu({ x, y, d }), []);

  useEffect(() => {
    if (useChats.getState().status === 'idle') void useChats.getState().load();
  }, []);

  // Debounced global (username) search.
  useEffect(() => {
    const q = query.trim().replace(/^@/, '');
    if (q.length < 2) return;
    const id = setTimeout(() => void useChats.getState().searchGlobal(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  const folders = useChats((s) => s.folders);
  const view = useChats((s) => s.view);
  const visible = useMemo(() => selectVisible({ dialogs, filter, query, folders, view }), [dialogs, filter, query, folders, view]);
  const archivedAll = useMemo(() => dialogs.filter((d) => d.archived), [dialogs]);

  // Leave an emptied archive.
  useEffect(() => {
    if (view === 'archive' && archivedAll.length === 0 && status === 'ready') useChats.getState().setView('main');
  }, [view, archivedAll.length, status]);

  const rows = useMemo<Row[]>(() => {
    const r: Row[] = [];
    const searchingNow = query.trim().length > 0;
    if (view === 'archive' && !searchingNow) r.push({ type: 'archiveBack' });
    else if (view === 'main' && !searchingNow && archivedAll.length > 0 && filter === 'all') r.push({ type: 'archive', count: archivedAll.length, unread: archivedAll.reduce((n, d) => n + (d.unread > 0 && !d.muted ? 1 : 0), 0) });
    visible.forEach((d) => r.push({ type: 'dialog', d, global: false }));
    if (loadingMore) r.push({ type: 'info', text: '…', busy: true });
    const searching = query.trim().replace(/^@/, '').length >= 2;
    if (searching) {
      const known = new Set(dialogs.map((d) => d.id));
      const extra = global.items.filter((d) => !known.has(d.id));
      if (global.status === 'loading' || extra.length > 0 || global.status === 'error') {
        r.push({ type: 'head', label: t('search.global') });
        if (global.status === 'loading') r.push({ type: 'info', text: '…', busy: true });
        if (global.status === 'error') r.push({ type: 'info', text: t('chats.error') });
        extra.forEach((d) => r.push({ type: 'dialog', d, global: true }));
      }
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, loadingMore, query, global, dialogs, lang, view, archivedAll, filter]);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.type === 'dialog' ? ROW_H : rows[i]?.type === 'archive' || rows[i]?.type === 'archiveBack' ? 60 : HEAD_H),
    overscan: 8,
    getItemKey: (i) => {
      const r = rows[i];
      return r?.type === 'dialog' ? `${r.global ? 'g' : 'd'}${r.d.id}` : `${r?.type}${i}`;
    },
  });

  const items = virt.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;

  // Infinite scroll: fetch the next page when the viewport nears the end of the list.
  useEffect(() => {
    if (hasMore && !loadingMore && lastIndex >= visible.length - 6) void useChats.getState().loadMore();
  }, [lastIndex, hasMore, loadingMore, visible.length]);

  if (status === 'loading' || status === 'idle') return <Skeletons />;

  if (status === 'error') {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div>
          <p className="font-semibold">{t('chats.error')}</p>
          <button
            onClick={() => void useChats.getState().load()}
            className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-110"
          >
            {t('chats.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (rows.length === 0 || (rows.length === 1 && rows[0]?.type === 'archiveBack')) {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div className="animate-rise">
          <div className="mb-3 text-5xl" aria-hidden="true">
            🔍
          </div>
          <p className="font-semibold">{t('chats.empty')}</p>
          <p className="mt-1 text-sm text-muted">{t('chats.emptySub')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="scroll-thin flex-1 overflow-y-auto px-2 pb-24"
      role="list"
      aria-label="Chats"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const btns = [...(scrollRef.current?.querySelectorAll<HTMLButtonElement>('[role=listitem] button') ?? [])];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        if (i < 0) return;
        e.preventDefault();
        btns[i + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
      }}
    >
      <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
        {items.map((v) => {
          const r = rows[v.index];
          if (!r) return null;
          return (
            <div
              key={v.key}
              role="listitem"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: v.size, transform: `translateY(${v.start}px)` }}
            >
              {r.type === 'dialog' ? (
                <DialogRow
                  d={r.d}
                  lang={lang}
                  active={r.d.id === selectedId}
                  onOpen={() => (r.global ? useChats.getState().selectPeer(r.d) : useChats.getState().select(r.d.id))}
                  onMenu={openMenu}
                />
              ) : r.type === 'archive' ? (
                <button
                  data-ripple
                  onClick={() => useChats.getState().setView('archive')}
                  className="flex h-full w-full items-center gap-3 rounded-xl px-2.5 text-left transition hover:bg-raised"
                  data-testid="archive-row"
                >
                  <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-muted/30 text-white">
                    <IconArchive size={24} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base font-medium">{t('archive.title')}</span>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    {r.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-muted/50 px-1.5 text-xs font-medium text-white">{r.unread}</span>}
                    {r.count}
                  </span>
                </button>
              ) : r.type === 'archiveBack' ? (
                <button
                  data-ripple
                  onClick={() => useChats.getState().setView('main')}
                  className="flex h-full w-full items-center gap-3 rounded-xl px-2.5 text-left font-semibold transition hover:bg-raised"
                  aria-label={t('login.back')}
                >
                  <IconBack size={22} className="text-muted" />
                  {t('archive.title')}
                </button>
              ) : r.type === 'head' ? (
                <div className="px-2 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{r.label}</div>
              ) : (
                <div className="grid h-full place-items-center text-sm text-muted">
                  {r.busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" /> : r.text}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={dialogMenuItems(menu.d, t)} onClose={() => setMenu(null)} />}
    </div>
  );
}
