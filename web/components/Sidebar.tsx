'use client';
import { useRef, useState } from 'react';
import { useOnline } from '@/lib/useOnline';
import { useChats } from '@/store/chats';
import { useT } from '@/store/ui';
import { ChatList } from './ChatList';
import { ContactsDialog } from './Dialogs';
import { FolderRail } from './FolderRail';
import { FolderTabs } from './FolderTabs';
import { IconClose, IconPencil, IconSearch } from './icons';
import { MainMenu } from './MainMenu';

export function Sidebar() {
  const t = useT();
  const query = useChats((s) => s.query);
  const connected = useChats((s) => s.connected);
  const online = useOnline();
  const [focused, setFocused] = useState(false);
  const [newMessage, setNewMessage] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const searching = focused || query.length > 0;

  const back = () => {
    useChats.getState().setQuery('');
    input.current?.blur();
    setFocused(false);
  };

  return (
    <aside className="relative flex h-full w-full border-r border-line bg-surface" aria-label="Chats">
      <FolderRail />
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="pt-safe box-content flex h-14 shrink-0 items-center gap-1.5 px-3">
        <MainMenu searching={searching} onBack={back} />
        <div className="relative min-w-0 flex-1">
          <IconSearch size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(e) => useChats.getState().setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation(); // clears the search, does not close the open chat
                back();
              }
            }}
            placeholder={t('sidebar.search')}
            aria-label={t('sidebar.search')}
            className="h-11 w-full rounded-[22px] bg-raised pl-11 pr-10 text-left text-base outline-none ring-1 ring-transparent transition placeholder:text-muted placeholder-shown:text-center focus:bg-surface focus:ring-accent focus:placeholder-shown:text-left [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => useChats.getState().setQuery('')}
              aria-label={t('compose.cancel')}
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-ink"
            >
              <IconClose size={18} />
            </button>
          )}
        </div>
      </header>

      {(!online || !connected) && (
        <div className="flex h-7 shrink-0 items-center justify-center gap-1 text-[0.8125rem] font-medium text-accent" role="status">
          {!online ? t('status.offline') : t('status.connecting')}
          <span className="typing-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}

      <FolderTabs />
      <ChatList />

      <button
        data-ripple
        onClick={() => setNewMessage(true)}
        aria-label={t('newMessage.title')}
        title={t('newMessage.title')}
        className="absolute bottom-5 right-5 z-10 grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-[0_2px_8px_rgb(0_0_0/.3)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgb(0_0_0/.32)] active:translate-y-0 active:shadow-[0_2px_8px_rgb(0_0_0/.3)]"
      >
        <IconPencil size={24} />
      </button>
      </div>
      {newMessage && <ContactsDialog title={t('newMessage.title')} onClose={() => setNewMessage(false)} />}
    </aside>
  );
}
