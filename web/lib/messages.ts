import type { Message } from './types';

export type Entry =
  | { type: 'date'; key: string; ts: number }
  | { type: 'msg'; key: string; m: Message; first: boolean; last: boolean };

// Browsers often lack the 'uz' locale, so month names are bundled.
const MONTHS: Record<string, string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

const GROUP_GAP_S = 5 * 60;
const dayKey = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Inserts local-time date separators and marks first/last message of consecutive runs. */
export function buildEntries(items: Message[]): Entry[] {
  const out: Entry[] = [];
  items.forEach((m, i) => {
    const prev = items[i - 1];
    const next = items[i + 1];
    const newDay = !prev || dayKey(prev.date) !== dayKey(m.date);
    if (newDay) out.push({ type: 'date', key: `d${dayKey(m.date)}`, ts: m.date });
    const same = (a: Message | undefined) =>
      !!a && !a.service && !m.service && a.out === m.out && a.senderName === m.senderName && dayKey(a.date) === dayKey(m.date) && Math.abs(m.date - a.date) < GROUP_GAP_S;
    out.push({ type: 'msg', key: `m${m.id}`, m, first: !same(prev), last: !same(next) });
  });
  return out;
}

export function dayLabel(ts: number, now: Date, labels: { today: string; yesterday: string }, locale: string): string {
  const d = new Date(ts * 1000);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return labels.today;
  if (diff === 1) return labels.yesterday;
  const month = MONTHS[locale]?.[d.getMonth()] ?? d.toLocaleDateString('en', { month: 'long' });
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  if (locale === 'en') return `${month} ${d.getDate()}${year}`;
  return locale === 'uz' ? `${d.getDate()}-${month}${year}` : `${d.getDate()} ${month}${year}`;
}

export const timeLabel = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/** "5-noyabr 2026" / "5 ноября 2026" / "November 5, 2026" */
export function longDate(ts: number, locale: string): string {
  const d = new Date(ts);
  const month = MONTHS[locale]?.[d.getMonth()] ?? '';
  if (locale === 'en') return `${month} ${d.getDate()}, ${d.getFullYear()}`;
  return locale === 'uz' ? `${d.getDate()}-${month} ${d.getFullYear()}` : `${d.getDate()} ${month} ${d.getFullYear()}`;
}
