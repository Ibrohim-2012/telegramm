'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useIsDark } from '@/lib/useIsDark';
import type { Me } from '@/lib/types';
import { useAccounts } from '@/store/accounts';
import { useAuth } from '@/store/auth';
import { useChats } from '@/store/chats';
import { usePremium } from '@/store/premium';
import { useToast } from '@/store/toast';
import { useT, useUi } from '@/store/ui';
import { Avatar } from './Avatar';
import { IconBookmark, IconChevronDown, IconCheck, IconChevronRight, IconLogout, IconMegaphone, IconMoon, IconPhone, IconProfile, IconSettings, IconStar, IconUser, IconUsers } from './icons';
import { IconPlus } from './icons';

const MS = 250;

export type MenuView = 'contacts' | 'settings' | 'profile' | 'group' | 'channel' | 'calls' | 'premium';

/** Telegram-Desktop-style side menu. */
export function Drawer({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (v: MenuView) => void }) {
  const t = useT();
  const mode = useAuth((s) => s.mode);
  const dark = useIsDark();
  const premium = usePremium((s) => s.info);
  const accounts = useAccounts((s) => s.items);
  const maxAccounts = useAccounts((s) => s.max);
  const [showAccounts, setShowAccounts] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Mount, then slide in on the next frame; slide out, then unmount.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const id = setTimeout(() => setMounted(false), MS);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api<Me>('/api/me').then((m) => live && setMe(m)).catch(() => {});
    void usePremium.getState().load();
    void useAccounts.getState().load();
    setShowAccounts(false);
    const prev = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', key, true);
    const f = setTimeout(() => panel.current?.querySelector<HTMLElement>('nav button')?.focus(), 60);
    return () => {
      live = false;
      clearTimeout(f);
      document.removeEventListener('keydown', key, true);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const pick = (v: MenuView) => run(() => onPick(v));

  const openSaved = () => {
    const st = useChats.getState();
    const id = st.meId ?? me?.id;
    if (!id) return;
    if (st.dialogs.some((d) => d.id === id)) st.select(id);
    else st.selectPeer({ id, kind: 'private', title: me?.firstName ?? 'Saved', unread: 0, pinned: false, muted: false, online: false });
  };

  const logout = () => useAccounts.getState().logout();

  const about = () => useToast.getState().show(`${t('appName')} 0.1${mode === 'mock' ? ' · MOCK' : ''}`);

  const name = me ? [me.firstName, me.lastName].filter(Boolean).join(' ') : '';
  const emoji = premium?.active ? premium.settings.emojiStatus : undefined;
  const item = 'relative flex h-[46px] w-full items-center gap-5 px-5 text-left text-[0.9375rem] font-medium transition-colors hover:bg-raised';
  const ico = 'shrink-0 text-muted';

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        style={{ opacity: shown ? 1 : 0, transitionDuration: `${MS}ms` }}
        onMouseDown={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t('menu.open')}
        className="absolute inset-y-0 left-0 flex w-[min(86vw,21rem)] flex-col bg-surface shadow-2xl"
        style={{ transform: shown ? 'none' : 'translateX(-100%)', transition: `transform ${MS}ms cubic-bezier(.4,0,.2,1)` }}
      >
        <div className="relative flex flex-col gap-2.5 px-5 pb-3.5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between">
            <Avatar id={me?.id ?? 'me'} title={name || '?'} size={64} photo />
            <button
              data-ripple
              onClick={() => setShowAccounts((v) => !v)}
              aria-label={t('acc.title')}
              aria-expanded={showAccounts}
              className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
            >
              <IconChevronDown size={20} className={`transition-transform duration-200 ${showAccounts ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <div className="min-w-0">
            {me ? (
              <>
                <p className="flex items-center gap-1.5 truncate text-base font-semibold" data-testid="drawer-name">
                  <span className="truncate">{name}</span>
                  {emoji ? <span aria-label={t('pm.emoji')}>{emoji}</span> : premium?.active ? <IconStar size={16} /> : null}
                </p>
                <button
                  onClick={pick('premium')}
                  className="mt-0.5 flex w-full items-center justify-between gap-2 rounded-md text-left text-sm text-muted transition-colors hover:text-ink"
                  aria-label={t('drawer.emojiStatus')}
                >
                  <span className="truncate">{emoji ? me.phone : t('drawer.emojiStatus')}</span>
                  <IconChevronRight size={18} className="shrink-0" />
                </button>
              </>
            ) : (
              <div className="space-y-2" aria-hidden="true">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3.5 w-40" />
              </div>
            )}
          </div>
        </div>

        {showAccounts && (
          <div className="border-t border-line py-1.5" role="group" aria-label={t('acc.title')} data-testid="accounts">
            {accounts
              .filter((a) => a.ready)
              .map((a) => {
                const n = a.me ? [a.me.firstName, a.me.lastName].filter(Boolean).join(' ') : '?';
                return (
                  <button
                    key={a.slot}
                    data-ripple
                    aria-current={a.active || undefined}
                    onClick={a.active ? undefined : run(() => void useAccounts.getState().switchTo(a.slot))}
                    className="flex h-[54px] w-full items-center gap-3 px-5 text-left transition-colors hover:bg-raised"
                  >
                    <Avatar id={`${a.slot}:${a.me?.id ?? ''}`} title={n} size={36} photo={a.active} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-medium">{n}</span>
                      <span className="block truncate text-xs text-muted">{a.me?.phone}</span>
                    </span>
                    {a.active && <IconCheck size={20} className="text-accent" />}
                  </button>
                );
              })}
            <button
              data-ripple
              disabled={accounts.filter((a) => a.ready).length >= maxAccounts}
              onClick={run(() => void useAccounts.getState().add())}
              className="flex h-[46px] w-full items-center gap-5 px-5 text-left text-[0.9375rem] font-medium text-accent transition-colors hover:bg-raised disabled:opacity-50"
              title={accounts.filter((a) => a.ready).length >= maxAccounts ? t('acc.limit') : undefined}
            >
              <IconPlus size={24} />
              {t('acc.add')}
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto border-t border-line py-1.5">
          <button data-ripple onClick={pick('profile')} className={item}>
            <IconProfile size={24} className={ico} />
            {t('drawer.profile')}
          </button>
          <button data-ripple onClick={pick('group')} className={item}>
            <IconUsers size={24} className={ico} />
            {t('drawer.newGroup')}
          </button>
          <button data-ripple onClick={pick('channel')} className={item}>
            <IconMegaphone size={24} className={ico} />
            {t('drawer.newChannel')}
          </button>
          <button data-ripple onClick={pick('contacts')} className={item}>
            <IconUser size={24} className={ico} />
            {t('drawer.contacts')}
          </button>
          <button data-ripple onClick={pick('calls')} className={item}>
            <IconPhone size={24} className={ico} />
            {t('drawer.calls')}
          </button>
          <button data-ripple onClick={run(openSaved)} className={item}>
            <IconBookmark size={24} className={ico} />
            {t('saved')}
          </button>
          <button data-ripple onClick={pick('settings')} className={item}>
            <IconSettings size={24} className={ico} />
            {t('menu.settings')}
          </button>
          <button data-ripple onClick={pick('premium')} className={item}>
            <IconStar size={24} />
            <span className="flex-1">{t('drawer.premium')}</span>
            {premium?.active && <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />}
          </button>
          <button
            data-ripple
            role="switch"
            aria-checked={dark}
            onClick={() => useUi.getState().setTheme(dark ? 'light' : 'dark')}
            className={item}
          >
            <IconMoon size={24} className={ico} />
            <span className="flex-1">{t('drawer.night')}</span>
            <span aria-hidden="true" className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${dark ? 'bg-accent' : 'bg-muted/50'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${dark ? 'left-[1.1rem]' : 'left-0.5'}`} />
            </span>
          </button>
          <button data-ripple onClick={run(() => void logout())} className={`${item} text-danger`}>
            <IconLogout size={24} />
            {t('menu.logout')}
          </button>
        </nav>

        <button onClick={about} className="px-5 pb-4 pt-2 text-left text-xs text-muted transition-colors hover:text-ink">
          {t('appName')} 0.1{mode === 'mock' ? ' · MOCK' : ''} – {t('drawer.about')}
        </button>
      </div>
    </div>
  );
}
