'use client';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { folderUnread } from '@/lib/folders';
import type { Filter } from '@/lib/types';
import { useChats } from '@/store/chats';
import { useT, useUi } from '@/store/ui';

const DEFAULT_TABS: { id: Filter; key: 'filter.all' | 'filter.private' | 'filter.group' | 'filter.channel' | 'filter.unread' }[] = [
  { id: 'all', key: 'filter.all' },
  { id: 'private', key: 'filter.private' },
  { id: 'group', key: 'filter.group' },
  { id: 'channel', key: 'filter.channel' },
  { id: 'unread', key: 'filter.unread' },
];

export interface Tab {
  id: Filter;
  label: string;
  /** Emoji of a Telegram folder (shown instead of the icon). */
  emoji?: string;
  count: number;
}

/**
 * The folders of the account (like the official apps), or the built-in categories when it has none.
 * Used by the horizontal tabs (phone/tablet) and the vertical rail (desktop).
 */
export function useFolderTabs(): Tab[] {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const dialogs = useChats((s) => s.dialogs);
  const folders = useChats((s) => s.folders);

  return useMemo<Tab[]>(() => {
    const unreadChats = dialogs.filter((d) => d.unread > 0 && !d.muted && !d.archived);
    if (folders.length > 0) {
      return [
        { id: 'all', label: t('filter.all'), count: unreadChats.length },
        ...folders.map((f): Tab => ({ id: `folder:${f.id}`, label: f.title, emoji: f.emoticon, count: folderUnread(f, dialogs) })),
      ];
    }
    return DEFAULT_TABS.map((x): Tab => ({
      id: x.id,
      label: t(x.key),
      count: x.id === 'unread' ? 0 : x.id === 'all' ? unreadChats.length : unreadChats.filter((d) => d.kind === x.id).length,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogs, folders, lang]);
}

/** Horizontal tabs with a sliding underline: phones and tablets. */
export function FolderTabs() {
  const filter = useChats((s) => s.filter);
  const tabs = useFolderTabs();
  const nav = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = nav.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (nav.current) ro.observe(nav.current);
    return () => ro.disconnect();
  }, [filter, tabs]);

  return (
    <nav ref={nav} className="scroll-thin relative flex h-11 shrink-0 overflow-x-auto border-b border-line px-1.5 lg:hidden" aria-label="Folders">
      {tabs.map((tab) => {
        const active = filter === tab.id;
        return (
          <button
            key={tab.id}
            data-ripple
            onClick={() => useChats.getState().setFilter(tab.id)}
            aria-pressed={active}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg px-2.5 text-sm font-medium transition-colors ${active ? 'text-accent' : 'text-muted hover:text-ink'}`}
          >
            {tab.emoji ? `${tab.emoji} ${tab.label}` : tab.label}
            {tab.count > 0 && (
              <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-medium leading-none ${active ? 'bg-accent text-accent-ink' : 'bg-badge text-white'}`}>{tab.count}</span>
            )}
          </button>
        );
      })}
      {bar && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-t-full bg-accent transition-[transform,width] duration-200 ease-out"
          style={{ width: bar.width, transform: `translateX(${bar.left}px)` }}
        />
      )}
    </nav>
  );
}
