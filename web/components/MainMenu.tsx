'use client';
import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { useDrawer } from '@/store/drawer';
import { useT } from '@/store/ui';
import { ContactsDialog } from './Dialogs';
import { Drawer, type MenuView } from './Drawer';
import { MenuArrow } from './icons';
import { CallsDialog, CreateChannelDialog, CreateGroupDialog, ProfileDialog } from './MenuDialogs';
import { PremiumDialog } from './PremiumDialog';

const SettingsPanel = dynamic(() => import('./SettingsPanel').then((m) => m.SettingsPanel), { ssr: false });

/**
 * Hamburger (phones/tablets; on desktop it lives in the folder rail) that morphs into a back arrow while searching.
 * Also hosts the side menu and every dialog it opens.
 */
export function MainMenu({ searching, onBack }: { searching: boolean; onBack: () => void }) {
  const t = useT();
  const open = useDrawer((s) => s.open);
  const setOpen = useDrawer((s) => s.setOpen);
  const [view, setView] = useState<MenuView | null>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const closeView = useCallback(() => setView(null), []);

  return (
    <>
      <button
        data-ripple
        onClick={() => (searching ? onBack() : setOpen(true))}
        aria-label={searching ? t('login.back') : t('menu.open')}
        aria-haspopup={searching ? undefined : 'dialog'}
        aria-expanded={searching ? undefined : open}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink ${searching ? '' : 'lg:hidden'}`}
      >
        <MenuArrow back={searching} />
      </button>
      <Drawer open={open} onClose={close} onPick={setView} />
      {view === 'settings' && <SettingsPanel onClose={closeView} onPremium={() => setView('premium')} />}
      {view === 'contacts' && <ContactsDialog title={t('contacts.title')} onClose={closeView} />}
      {view === 'profile' && <ProfileDialog onClose={closeView} />}
      {view === 'group' && <CreateGroupDialog onClose={closeView} />}
      {view === 'channel' && <CreateChannelDialog onClose={closeView} />}
      {view === 'calls' && <CallsDialog onClose={closeView} />}
      {view === 'premium' && <PremiumDialog onClose={closeView} />}
    </>
  );
}
