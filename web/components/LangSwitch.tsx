'use client';
import { LANGS } from '@/lib/i18n';
import { useUi } from '@/store/ui';

export function LangSwitch({ className = '' }: { className?: string }) {
  const lang = useUi((s) => s.lang);
  const setLang = useUi((s) => s.setLang);
  return (
    <div className={`inline-flex rounded-full bg-raised/80 p-1 backdrop-blur ${className}`} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase transition ${
            lang === l.code ? 'bg-accent text-accent-ink shadow' : 'text-muted hover:text-ink'
          }`}
        >
          {l.code}
        </button>
      ))}
    </div>
  );
}
