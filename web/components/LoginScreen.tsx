'use client';
import { useAccounts } from '@/store/accounts';
import { useEffect, useRef, useState } from 'react';
import { errorText } from '@/lib/i18n';
import { useAuth } from '@/store/auth';
import { useT, useUi } from '@/store/ui';
import { CountryPicker, COUNTRIES } from './CountryPicker';
import { LangSwitch } from './LangSwitch';

function PlaneLogo() {
  return (
    <svg viewBox="0 0 64 64" className="h-20 w-20 drop-shadow-lg" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4cc2ff" />
          <stop offset="1" stopColor="#1d6fe0" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#lg)" />
      <path d="M14 31.5 48 18c1.6-.6 3 .4 2.5 2.6l-5.8 27c-.4 1.9-1.6 2.4-3.2 1.5l-8.8-6.5-4.2 4.1c-.5.5-.9.9-1.8.9l.6-9 16.4-14.8c.7-.6-.2-1-1.1-.4L19.9 35.6l-8.7-2.7c-1.9-.6-1.9-1.9.4-2.8Z" fill="#fff" />
    </svg>
  );
}

export function LoginScreen() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { state, busy, errorCode, retryAfter, mode } = useAuth();
  const { sendPhone, sendCode, sendPassword, sendAccess, backToPhone, init } = useAuth.getState();

  const [country, setCountry] = useState(0);
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [access, setAccess] = useState('');
  const phoneRef = useRef<HTMLInputElement>(null);
  const otherReady = useAccounts((s) => s.items.some((a) => a.ready && !a.active));
  useEffect(() => {
    if (state !== 'locked' && state !== 'offline' && state !== 'loading') void useAccounts.getState().load();
  }, [state]);

  // FLOOD_WAIT countdown: block submit until Telegram lets us retry.
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (!retryAfter) return setWait(0);
    setWait(retryAfter);
    const id = setInterval(() => setWait((w) => (w <= 1 ? (clearInterval(id), 0) : w - 1)), 1000);
    return () => clearInterval(id);
  }, [retryAfter, errorCode]);

  const step = state === 'locked' ? 'access' : state === 'code_sent' ? 'code' : state === 'password_needed' ? 'password' : 'phone';
  const digits = number.replace(/\D/g, '');
  const dial = COUNTRIES[country]?.dial ?? '998';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || wait > 0) return;
    if (state === 'offline') return void init();
    if (step === 'access') void sendAccess(access);
    else if (step === 'phone') void sendPhone(`+${dial}${digits}`);
    else if (step === 'code') void sendCode(code);
    else void sendPassword(password);
  };

  const canSubmit =
    state === 'offline' || (step === 'access' ? access.length >= 8 : step === 'phone' ? digits.length >= 7 : step === 'code' ? /^\d{4,6}$/.test(code) : password.length > 0);

  const title = step === 'access' ? t('access.title') : step === 'phone' ? t('login.title') : step === 'code' ? t('login.codeTitle') : t('login.passTitle');
  const sub = step === 'access' ? t('access.sub') : step === 'phone' ? t('login.subtitle') : step === 'code' ? t('login.codeSub') : t('login.passSub');

  const input =
    'w-full rounded-xl border border-line bg-raised/70 px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/30';

  return (
    <main className="relative grid h-full place-items-center overflow-y-auto px-4 py-8">
      {/* animated backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-[28rem] w-[28rem] animate-float rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-[32rem] w-[32rem] animate-float rounded-full bg-[#7b61ff]/25 blur-3xl [animation-delay:-5s]" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 animate-float rounded-full bg-[#2fd3b0]/20 blur-3xl [animation-delay:-9s]" />
      </div>

      <div className="absolute right-4 top-4 z-10">
        <LangSwitch />
      </div>

      <section className="relative z-10 w-full max-w-[26rem] animate-rise rounded-3xl border border-white/20 bg-surface/80 p-8 shadow-2xl shadow-black/10 backdrop-blur-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <PlaneLogo />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{sub}</p>
        </div>

        <form onSubmit={submit} className="space-y-3" noValidate>
          {step === 'access' && (
            <input
              className={input}
              type="password"
              autoComplete="off"
              autoFocus
              placeholder={t('access.code')}
              aria-label={t('access.code')}
              value={access}
              onChange={(e) => setAccess(e.target.value)}
            />
          )}
          {step === 'phone' && (
            <>
              <div className="flex gap-2">
                <CountryPicker value={country} onChange={(i) => { setCountry(i); phoneRef.current?.focus(); }} label={t('login.country')} />
                <input
                  ref={phoneRef}
                  className={`${input} min-w-0 flex-1`}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  autoFocus
                  placeholder="90 123 45 67"
                  aria-label={t('login.phone')}
                  value={number}
                  maxLength={16}
                  onChange={(e) => setNumber(e.target.value.replace(/[^\d\s-]/g, ''))}
                />
              </div>
            </>
          )}
          {step === 'code' && (
            <input
              className={`${input} text-center text-2xl font-semibold tracking-[0.5em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="•••••"
              aria-label={t('login.code')}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          )}
          {step === 'password' && (
            <input
              className={input}
              type="password"
              autoComplete="current-password"
              autoFocus
              placeholder={t('login.password')}
              aria-label={t('login.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          {errorCode && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {errorText(lang, errorCode)}
              {wait > 0 ? ` (${wait}s)` : ''}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || wait > 0 || !canSubmit}
            className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink shadow-lg shadow-accent/25 transition hover:brightness-110 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-ink/40 border-t-accent-ink" />}
            {state === 'offline' ? t('chats.retry') : t('login.next')}
          </button>

          {step !== 'phone' && step !== 'access' && (
            <button
              type="button"
              onClick={backToPhone}
              className="w-full rounded-xl px-4 py-2 text-sm font-medium text-muted transition hover:text-ink"
            >
              ← {t('login.back')}
            </button>
          )}
        </form>
        {otherReady && (
          <button type="button" onClick={() => void useAccounts.getState().cancel()} className="mt-2 w-full rounded-xl px-4 py-2 text-sm font-medium text-muted transition hover:text-ink">
            {t('acc.cancel')}
          </button>
        )}

        {mode === 'mock' && (
          <p className="mt-5 rounded-lg bg-accent/10 px-3 py-2 text-center text-xs text-accent">{t('login.mockHint')}</p>
        )}
        <p className="mt-5 text-center text-xs text-muted">{t('login.footer')}</p>
      </section>
    </main>
  );
}
