'use client';
import { useEffect, useState } from 'react';
import { errorText } from '@/lib/i18n';
import { longDate } from '@/lib/messages';
import type { Accent } from '@/lib/types';
import { usePremium } from '@/store/premium';
import { useToast } from '@/store/toast';
import { useT, useUi } from '@/store/ui';
import { IconCheck, IconClose, IconMegaphone, IconPalette, IconStar, IconUpload, IconUser } from './icons';

const EMOJIS = ['🔥', '🚀', '⭐', '💎', '🎯', '🌈', '🦄', '🍀', '👑', '🎧', '⚡', '❤️'];
const SWATCH: Record<Accent, string> = {
  blue: '#3390ec',
  green: '#388e3c',
  pink: '#d81b60',
  orange: '#d65a00',
  teal: '#00838f',
  violet: '#673ab7',
};

/** Emoji status + accent colour pickers (Premium only). */
export function PremiumSettings() {
  const t = useT();
  const info = usePremium((s) => s.info);
  if (!info?.active) return null;
  const { emojiStatus, accent } = info.settings;
  return (
    <div className="space-y-4" data-testid="premium-settings">
      <div>
        <p className="mb-1.5 text-sm font-semibold">{t('pm.emoji')}</p>
        <div className="flex flex-wrap gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => void usePremium.getState().update({ emojiStatus: emojiStatus === e ? null : e })}
              aria-pressed={emojiStatus === e}
              className={`grid h-10 w-10 place-items-center rounded-xl text-xl transition ${emojiStatus === e ? 'bg-accent/15 ring-2 ring-accent' : 'bg-raised hover:brightness-95'}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <AccentPicker />
      {(emojiStatus || accent) && (
        <button onClick={() => void usePremium.getState().update({ emojiStatus: null, accent: null })} className="text-sm font-medium text-muted transition hover:text-danger">
          {t('pm.clear')}
        </button>
      )}
    </div>
  );
}

export function AccentPicker() {
  const t = useT();
  const info = usePremium((s) => s.info);
  const active = info?.active ?? false;
  const current = (active ? info?.settings.accent : undefined) ?? 'blue';
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
        {t('pm.accent')}
        {!active && <span className="rounded-full bg-raised px-2 py-0.5 text-[0.6875rem] font-medium text-muted">{t('pm.only')}</span>}
      </p>
      <div role="radiogroup" aria-label={t('pm.accent')} className="flex flex-wrap gap-2">
        {(info?.accents ?? (Object.keys(SWATCH) as Accent[])).map((a) => (
          <button
            key={a}
            role="radio"
            aria-checked={current === a}
            aria-label={t(`accent.${a}` as 'accent.blue')}
            title={t(`accent.${a}` as 'accent.blue')}
            disabled={!active}
            onClick={() => void usePremium.getState().update({ accent: a === 'blue' ? null : a })}
            className={`grid h-9 w-9 place-items-center rounded-full text-white transition disabled:opacity-40 ${current === a ? 'ring-2 ring-offset-2 ring-offset-surface' : ''}`}
            style={{ background: SWATCH[a], ['--tw-ring-color' as string]: SWATCH[a] }}
          >
            {current === a && <IconCheck size={18} />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PremiumDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const info = usePremium((s) => s.info);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    void usePremium.getState().load();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [onClose]);

  const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((a, [k, x]) => a.split(`{${k}}`).join(String(x)), s);

  const trial = async () => {
    setBusy(true);
    await usePremium.getState().startTrial();
    setBusy(false);
  };
  const redeem = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setErr('');
    const r = await usePremium.getState().redeem(code);
    setBusy(false);
    if (r.ok) {
      setCode('');
      useToast.getState().show(t('pm.redeemed'));
    } else setErr(errorText(lang, r.code));
  };

  const perks = [
    { icon: <IconUpload size={22} />, title: t('pm.perk.upload'), text: fill(t('pm.perk.upload.d'), { n: info?.uploadMb.premium ?? 200 }) },
    { icon: <span className="text-xl leading-none">😎</span>, title: t('pm.perk.emoji'), text: t('pm.perk.emoji.d') },
    { icon: <IconPalette size={22} />, title: t('pm.perk.accent'), text: t('pm.perk.accent.d') },
    { icon: <IconMegaphone size={22} />, title: t('pm.perk.wp'), text: t('pm.perk.wp.d') },
    { icon: <IconUser size={22} />, title: t('pm.perk.badge'), text: t('pm.perk.badge.d') },
  ];

  const status =
    info?.state === 'trial' ? t('pm.statusTrial') : info?.state === 'active' ? t('pm.statusActive') : info?.state === 'expired' ? t('pm.statusExpired') : '';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t('pm.title')} className="scroll-thin relative max-h-[92vh] w-full max-w-md animate-pop overflow-y-auto rounded-3xl bg-surface shadow-2xl">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#6c5ce7] via-[#a259ff] to-[#ff6ac1] px-6 pb-6 pt-8 text-center text-white">
          <button onClick={onClose} aria-label={t('media.close')} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/15 transition hover:bg-white/25">
            <IconClose size={18} />
          </button>
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-white/20">
            <IconStar size={38} gradient={false} className="text-white" />
          </div>
          <h2 className="text-xl font-bold">{t('pm.title')}</h2>
          <p className="mt-1 text-sm text-white/85">{t('pm.sub')}</p>
        </div>

        <div className="space-y-4 px-5 pb-5 pt-4">
          {info && status && (
            <div className="rounded-2xl bg-accent/10 px-4 py-3" role="status" data-testid="premium-status">
              <p className="font-semibold text-accent">{status}</p>
              {info.active && info.until && (
                <p className="text-sm text-muted">{fill(t('pm.until'), { date: longDate(info.until, lang), n: info.daysLeft ?? 0 })}</p>
              )}
            </div>
          )}

          <ul className="space-y-3">
            {perks.map((p) => (
              <li key={p.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">{p.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-semibold">{p.title}</span>
                  <span className="block text-sm text-muted">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>

          {info && !info.trialUsed && (
            <div>
              <button
                onClick={() => void trial()}
                disabled={busy}
                className="h-12 w-full rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#ff6ac1] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {fill(t('pm.trial'), { n: info.trialMonths })}
              </button>
              <p className="mt-1.5 text-center text-xs text-muted">{fill(t('pm.trialNote'), { price: info.price })}</p>
            </div>
          )}

          {info?.active && <PremiumSettings />}

          <div>
            <label className="mb-1.5 block text-sm font-semibold" htmlFor="pm-code">
              {t('pm.code')}
            </label>
            <div className="flex gap-2">
              <input
                id="pm-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setErr('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && void redeem()}
                placeholder={t('pm.codePh')}
                autoComplete="off"
                spellCheck={false}
                className="h-11 min-w-0 flex-1 rounded-xl bg-raised px-3 font-mono text-sm uppercase outline-none ring-1 ring-transparent placeholder:normal-case focus:ring-accent"
              />
              <button onClick={() => void redeem()} disabled={busy || !code.trim()} className="rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50">
                {t('pm.redeem')}
              </button>
            </div>
            {err && (
              <p className="mt-1.5 text-sm text-danger" role="alert">
                {err}
              </p>
            )}
            {info?.buyUrl && (
              <a href={info.buyUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-medium text-accent hover:underline">
                {t('pm.buy')} · {info.price}
              </a>
            )}
            {info && !info.buyUrl && <p className="mt-2 text-xs text-muted">{info.price}</p>}
          </div>

          <p className="text-center text-xs text-muted">{t('pm.about')}</p>
        </div>
      </div>
    </div>
  );
}
