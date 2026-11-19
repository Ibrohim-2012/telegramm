'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUi } from '@/store/ui';

export interface Country {
  iso: string;
  name: Record<'uz' | 'ru' | 'en', string>;
  dial: string;
}

const c = (iso: string, dial: string, uz: string, ru: string, en: string): Country => ({ iso, dial, name: { uz, ru, en } });

export const COUNTRIES: Country[] = [
  c('UZ', '998', 'O‘zbekiston', 'Узбекистан', 'Uzbekistan'),
  c('KZ', '7', 'Qozog‘iston', 'Казахстан', 'Kazakhstan'),
  c('RU', '7', 'Rossiya', 'Россия', 'Russia'),
  c('KG', '996', 'Qirg‘iziston', 'Кыргызстан', 'Kyrgyzstan'),
  c('TJ', '992', 'Tojikiston', 'Таджикистан', 'Tajikistan'),
  c('TM', '993', 'Turkmaniston', 'Туркменистан', 'Turkmenistan'),
  c('AF', '93', 'Afg‘oniston', 'Афганистан', 'Afghanistan'),
  c('TR', '90', 'Turkiya', 'Турция', 'Türkiye'),
  c('AZ', '994', 'Ozarbayjon', 'Азербайджан', 'Azerbaijan'),
  c('AM', '374', 'Armaniston', 'Армения', 'Armenia'),
  c('GE', '995', 'Gruziya', 'Грузия', 'Georgia'),
  c('UA', '380', 'Ukraina', 'Украина', 'Ukraine'),
  c('BY', '375', 'Belarus', 'Беларусь', 'Belarus'),
  c('PL', '48', 'Polsha', 'Польша', 'Poland'),
  c('DE', '49', 'Germaniya', 'Германия', 'Germany'),
  c('FR', '33', 'Fransiya', 'Франция', 'France'),
  c('IT', '39', 'Italiya', 'Италия', 'Italy'),
  c('ES', '34', 'Ispaniya', 'Испания', 'Spain'),
  c('GB', '44', 'Buyuk Britaniya', 'Великобритания', 'United Kingdom'),
  c('US', '1', 'AQSh', 'США', 'United States'),
  c('CA', '1', 'Kanada', 'Канада', 'Canada'),
  c('KR', '82', 'Janubiy Koreya', 'Южная Корея', 'South Korea'),
  c('JP', '81', 'Yaponiya', 'Япония', 'Japan'),
  c('CN', '86', 'Xitoy', 'Китай', 'China'),
  c('IN', '91', 'Hindiston', 'Индия', 'India'),
  c('AE', '971', 'BAA', 'ОАЭ', 'UAE'),
  c('SA', '966', 'Saudiya Arabistoni', 'Саудовская Аравия', 'Saudi Arabia'),
  c('EG', '20', 'Misr', 'Египет', 'Egypt'),
  c('IL', '972', 'Isroil', 'Израиль', 'Israel'),
];

/** "+998" button that opens a searchable country list (the native <select> was too cramped). */
export function CountryPicker({ value, onChange, label }: { value: number; onChange: (i: number) => void; label: string }) {
  const lang = useUi((s) => s.lang);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const cur = COUNTRIES[value]!;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^\+/, '');
    return COUNTRIES.map((x, i) => ({ x, i })).filter(({ x }) => !s || x.dial.startsWith(s) || x.iso.toLowerCase() === s || Object.values(x.name).some((n) => n.toLowerCase().includes(s)));
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    ref.current?.querySelector('input')?.focus();
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setQ('');
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${cur.name[lang]} +${cur.dial}`}
        className="flex h-full items-center gap-2 rounded-xl border border-line bg-raised/70 px-3 py-3 text-base font-semibold transition hover:border-accent focus:border-accent focus:ring-2 focus:ring-accent/30"
      >
        <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-xs font-bold text-accent">{cur.iso}</span>
        <span>+{cur.dial}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-muted transition ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-3rem))] animate-pop overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === 'ru' ? 'Поиск страны' : lang === 'en' ? 'Search country' : 'Davlatni qidiring'}
            aria-label={label}
            className="w-full border-b border-line bg-transparent px-4 py-3 text-sm outline-none"
          />
          <ul role="listbox" aria-label={label} className="scroll-thin max-h-64 overflow-y-auto p-1">
            {list.map(({ x, i }) => (
              <li key={x.iso} role="option" aria-selected={i === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(i);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-raised ${i === value ? 'bg-accent/10 font-semibold' : ''}`}
                >
                  <span className="w-7 shrink-0 text-xs font-bold text-accent">{x.iso}</span>
                  <span className="min-w-0 flex-1 truncate">{x.name[lang]}</span>
                  <span className="text-muted">+{x.dial}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">—</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
