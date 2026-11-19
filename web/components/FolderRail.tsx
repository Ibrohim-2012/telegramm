'use client';
import { useChats } from '@/store/chats';
import { useDrawer } from '@/store/drawer';
import { useT } from '@/store/ui';
import { useFolderTabs } from './FolderTabs';
import { IconChats, IconFolder, IconMail, IconMegaphone, IconUser, IconUsers, MenuArrow } from './icons';

const ICONS: Record<string, (p: { size?: number; className?: string }) => React.ReactElement> = {
  all: IconChats,
  private: IconUser,
  group: IconUsers,
  channel: IconMegaphone,
  unread: IconMail,
};

/** Vertical folder rail on the left of the chat list (desktop, like Telegram Desktop). */
export function FolderRail() {
  const t = useT();
  const filter = useChats((s) => s.filter);
  const tabs = useFolderTabs();

  return (
    <div className="hidden w-[76px] shrink-0 flex-col items-center border-r border-line bg-surface pt-safe lg:flex">
      <div className="flex h-14 shrink-0 items-center">
        <button
          data-ripple
          onClick={() => useDrawer.getState().setOpen(true)}
          aria-label={t('menu.open')}
          aria-haspopup="dialog"
          className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
        >
          <MenuArrow back={false} />
        </button>
      </div>
      <nav className="scroll-thin flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-1.5 pb-3" aria-label="Folders">
        {tabs.map((tab) => {
          const active = filter === tab.id;
          const Icon = ICONS[tab.id] ?? IconFolder;
          return (
            <button
              key={tab.id}
              data-ripple
              onClick={() => useChats.getState().setFilter(tab.id)}
              aria-pressed={active}
              title={tab.label}
              className={`relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors ${active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-raised hover:text-ink'}`}
            >
              <span className="relative grid h-7 w-7 place-items-center">
                {tab.emoji ? <span className="text-[1.5rem] leading-none">{tab.emoji}</span> : <Icon size={26} />}
                {tab.count > 0 && (
                  <span
                    className={`absolute -right-2.5 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[0.6875rem] font-medium leading-none ${active ? 'bg-accent text-accent-ink' : 'bg-badge text-white'}`}
                  >
                    {tab.count > 99 ? '99+' : tab.count}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center text-[0.6875rem] font-medium leading-[1.15]">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
