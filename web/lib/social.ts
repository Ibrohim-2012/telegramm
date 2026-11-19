import type { Reaction } from './types';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const;

/**
 * Mirrors the server rule so the UI can update instantly: one reaction per user,
 * choosing the same emoji again (or null) removes it.
 */
export function applyReaction(list: Reaction[] | undefined, emoji: string | null): Reaction[] | undefined {
  const next = (list ?? []).map((r) => ({ ...r }));
  const prev = next.find((r) => r.mine);
  if (prev) {
    prev.mine = false;
    prev.count -= 1;
  }
  if (emoji && prev?.emoji !== emoji) {
    const hit = next.find((r) => r.emoji === emoji);
    if (hit) {
      hit.count += 1;
      hit.mine = true;
    } else next.push({ emoji, count: 1, mine: true });
  }
  const out = next.filter((r) => r.count > 0);
  return out.length ? out : undefined;
}

/** 1–3 emoji and nothing else (Telegram shows these big, without a bubble). Returns how many, or 0. */
export function emojiOnlyCount(text: string): number {
  const t = text.trim();
  if (!t || t.length > 40) return 0;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)].map((s) => s.segment).filter((g) => g.trim());
  if (graphemes.length === 0 || graphemes.length > 3) return 0;
  const isEmoji = (g: string) => /\p{Extended_Pictographic}/u.test(g) || /^\p{Regional_Indicator}{2}$/u.test(g) || /^[0-9#*]️?⃣$/.test(g);
  return graphemes.every(isEmoji) ? graphemes.length : 0;
}

export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, hit: false }];
  const out: { text: string; hit: boolean }[] = [];
  const low = text.toLowerCase();
  const needle = q.toLowerCase();
  let i = 0;
  for (;;) {
    const at = low.indexOf(needle, i);
    if (at < 0) break;
    if (at > i) out.push({ text: text.slice(i, at), hit: false });
    out.push({ text: text.slice(at, at + needle.length), hit: true });
    i = at + needle.length;
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false });
  return out;
}
