'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { LANGS } from '@/lib/i18n';
import type { Me } from '@/lib/types';
import { useAccounts } from '@/store/accounts';
import { usePremium } from '@/store/premium';
import { PREMIUM_WALLPAPERS, useT, useUi, WALLPAPERS, type Theme } from '@/store/ui';
import { Avatar } from './Avatar';
import { IconBack, IconBell, IconChatBubble, IconChevronRight, IconClose, IconGlobe, IconLogout, IconPalette, IconStar } from './icons';
import { AccentPicker } from './PremiumDialog';

const THEMES: { id: Theme; key: 'theme.light' | 'theme.dark' | 'theme.system' }[] = [
  { id: 'light', key: 'theme.light' },
  { id: 'dark', key: 'theme.dark' },
  { id: 'system', key: 'theme.system' },
];

type Page = 'root' | 'notifications' | 'chat' | 'appearance' | 'language';

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-raised p-1">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-lg px-2 py-1.5 text-sm font-semibold transition ${value === o.id ? 'bg-surface text-accent shadow' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${checked ? 'bg-accent' : 'bg-muted/40'}`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[1.4rem]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

/** Telegram-Desktop-like settings: a list of sections, each opening its own page. */
export function SettingsPanel({ onClose, onPremium }: { onClose: () => void; onPremium: () => void }) {
  const t = useT();
  const { theme, setTheme, lang, setLang, fontSize, setFontSize, wallpaper, setWallpaper, notify, sound, notifyPreview, setPrefs } = useUi();
  const premium = usePremium((s) => s.info);
  const [page, setPage] = useState<Page>('root');
  const [me, setMe] = useState<Me | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    let live = true;
    api<Me>('/api/me').then((m) => live && setMe(m)).catch(() => {});
    void usePremium.getState().load();
    setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (page === 'root') onClose();
      else setPage('root');
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [page, onClose]);

  const toggleNotify = async (on: boolean) => {
    if (!on) return setPrefs({ notify: false });
    if (typeof Notification === 'undefined') return setPerm('unsupported');
    const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    setPerm(p);
    setPrefs({ notify: p === 'granted' });
  };

  const logout = async () => {
    onClose();
    await useAccounts.getState().logout();
  };

  const name = me ? [me.firstName, me.lastName].filter(Boolean).join(' ') : '';
  const isPrem = premium?.active ?? false;
  const title: Record<Page, string> = {
    root: t('settings.title'),
    notifications: t('st.notif'),
    chat: t('st.chat'),
    appearance: t('st.appearance'),
    language: t('st.lang'),
  };
  const row = 'flex h-[52px] w-full items-center gap-4 rounded-xl px-3 text-left text-[0.9375rem] font-medium transition-colors hover:bg-raised';
  const h = 'mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t('settings.title')} className="flex max-h-[88vh] w-full max-w-md animate-pop flex-col overflow-hidden rounded-3xl bg-surface shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-2 px-3">
          {page !== 'root' && (
            <button data-ripple onClick={() => setPage('root')} aria-label={t('st.back')} className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink">
              <IconBack size={22} />
            </button>
          )}
          <h2 className={`flex-1 text-lg font-bold ${page === 'root' ? 'pl-2' : ''}`}>{title[page]}</h2>
          <button data-ripple onClick={onClose} aria-label={t('media.close')} className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink">
            <IconClose size={20} />
          </button>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {page === 'root' && (
            <>
              <div className="mb-2 flex items-center gap-3.5 rounded-2xl bg-raised p-3.5" data-testid="my-profile">
                <Avatar id={me?.id ?? 'me'} title={name || '?'} size={60} photo />
                <div className="min-w-0">
                  {me ? (
                    <>
                      <p className="flex items-center gap-1.5 truncate text-base font-bold">
                        <span className="truncate">{name}</span>
                        {isPrem && (premium?.settings.emojiStatus ? <span>{premium.settings.emojiStatus}</span> : <IconStar size={16} />)}
                      </p>
                      <p className="truncate text-sm text-muted">{[me.phone, me.username && `@${me.username}`].filter(Boolean).join(' · ')}</p>
                    </>
                  ) : (
                    <div className="space-y-2" aria-hidden="true">
                      <div className="skeleton h-4 w-32" />
                      <div className="skeleton h-3 w-24" />
                    </div>
                  )}
                </div>
              </div>
              {(
                [
                  ['notifications', <IconBell key="i" size={24} />, t('st.notif')],
                  ['chat', <IconChatBubble key="i" size={24} />, t('st.chat')],
                  ['appearance', <IconPalette key="i" size={24} />, t('st.appearance')],
                  ['language', <IconGlobe key="i" size={24} />, t('st.lang')],
                ] as [Page, React.ReactNode, string][]
              ).map(([id, icon, label]) => (
                <button key={id} data-ripple onClick={() => setPage(id)} className={row}>
                  <span className="text-muted">{icon}</span>
                  <span className="flex-1">{label}</span>
                  <IconChevronRight size={18} className="text-muted" />
                </button>
              ))}
              <button
                data-ripple
                onClick={() => {
                  onClose();
                  onPremium();
                }}
                className={row}
              >
                <IconStar size={24} />
                <span className="flex-1">{t('st.premium')}</span>
                <IconChevronRight size={18} className="text-muted" />
              </button>
              <button data-ripple onClick={() => void logout()} className={`${row} mt-2 text-danger`}>
                <IconLogout size={24} />
                {t('menu.logout')}
              </button>
            </>
          )}

          {page === 'notifications' && (
            <>
              <Switch checked={notify && perm === 'granted'} onChange={(v) => void toggleNotify(v)} label={t('settings.notify')} hint={t('settings.notifyHint')} disabled={perm === 'unsupported'} />
              {perm === 'denied' && <p className="text-xs text-danger">{t('settings.notifyDenied')}</p>}
              {perm === 'unsupported' && <p className="text-xs text-danger">{t('settings.notifyUnsupported')}</p>}
              <Switch checked={sound} onChange={(v) => setPrefs({ sound: v })} label={t('settings.sound')} />
              <Switch checked={notifyPreview} onChange={(v) => setPrefs({ notifyPreview: v })} label={t('settings.preview')} />
            </>
          )}

          {page === 'chat' && (
            <>
              <label className="mt-2 block">
                <span className="flex justify-between text-sm font-medium">
                  {t('settings.fontSize')}
                  <span className="text-muted">{fontSize}px</span>
                </span>
                <input type="range" min={13} max={20} step={1} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="mt-2 w-full accent-[rgb(var(--accent))]" />
              </label>
              <h3 className={h}>{t('settings.wallpaper')}</h3>
              <div role="radiogroup" aria-label={t('settings.wallpaper')} className="grid grid-cols-3 gap-2">
                {WALLPAPERS.map((w) => {
                  const locked = PREMIUM_WALLPAPERS.includes(w) && !isPrem;
                  return (
                    <button
                      key={w}
                      role="radio"
                      aria-checked={wallpaper === w}
                      title={locked ? t('pm.only') : undefined}
                      onClick={() => (locked ? (onClose(), onPremium()) : setWallpaper(w))}
                      className={`group relative overflow-hidden rounded-xl border-2 text-left transition ${wallpaper === w ? 'border-accent' : 'border-transparent hover:border-line'}`}
                    >
                      <span data-wp={w} className="wallpaper block h-14 w-full" />
                      <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium">
                        {t(`wp.${w}` as 'wp.classic')}
                        {PREMIUM_WALLPAPERS.includes(w) && <IconStar size={12} />}
                      </span>
                      {locked && <span className="absolute inset-0 bg-surface/40" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {page === 'appearance' && (
            <div className="mt-2 space-y-5">
              <Segmented value={theme} onChange={setTheme} label={t('menu.theme')} options={THEMES.map((x) => ({ id: x.id, label: t(x.key) }))} />
              <AccentPicker />
              {!isPrem && (
                <button
                  onClick={() => {
                    onClose();
                    onPremium();
                  }}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {t('drawer.premium')} →
                </button>
              )}
            </div>
          )}

          {page === 'language' && (
            <div className="mt-2">
              <Segmented value={lang} onChange={setLang} label={t('menu.language')} options={LANGS.map((l) => ({ id: l.code, label: l.label }))} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
