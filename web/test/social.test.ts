import { describe, expect, it } from 'vitest';
import { nameColor } from '@/lib/format';
import { applyReaction, emojiOnlyCount, highlightParts } from '@/lib/social';
import { useDrafts } from '@/store/drafts';

describe('applyReaction (mirrors the server rule)', () => {
  it('adds, switches and toggles off', () => {
    const a = applyReaction(undefined, '👍');
    expect(a).toEqual([{ emoji: '👍', count: 1, mine: true }]);
    expect(applyReaction(a, '❤️')).toEqual([{ emoji: '❤️', count: 1, mine: true }]);
    expect(applyReaction(a, '👍')).toBeUndefined();
    expect(applyReaction(a, null)).toBeUndefined();
  });
  it('keeps other people\'s counts and never mutates the input', () => {
    const base = [{ emoji: '👍', count: 2, mine: false }];
    expect(applyReaction(base, '👍')).toEqual([{ emoji: '👍', count: 3, mine: true }]);
    expect(base).toEqual([{ emoji: '👍', count: 2, mine: false }]);
  });
});

describe('emojiOnlyCount', () => {
  it('counts 1-3 emoji only', () => {
    expect(emojiOnlyCount('😂')).toBe(1);
    expect(emojiOnlyCount(' 👍🏽 ❤️ ')).toBe(2);
    expect(emojiOnlyCount('🇺🇿🔥🎉')).toBe(3);
    expect(emojiOnlyCount('👨‍👩‍👧')).toBe(1);
  });
  it('rejects text, long runs and empty', () => {
    expect(emojiOnlyCount('salom 😂')).toBe(0);
    expect(emojiOnlyCount('😂😂😂😂')).toBe(0);
    expect(emojiOnlyCount('')).toBe(0);
    expect(emojiOnlyCount('123')).toBe(0);
  });
});

describe('highlightParts', () => {
  it('splits case-insensitively and keeps original casing', () => {
    expect(highlightParts('Salom salom SALOM', 'salom').filter((p) => p.hit).map((p) => p.text)).toEqual(['Salom', 'salom', 'SALOM']);
    expect(highlightParts('abc', '')).toEqual([{ text: 'abc', hit: false }]);
    expect(highlightParts('abc', 'zzz')).toEqual([{ text: 'abc', hit: false }]);
  });
});

describe('nameColor', () => {
  it('is stable per name', () => {
    expect(nameColor('Aziza')).toBe(nameColor('Aziza'));
    expect(nameColor('Aziza')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('drafts store', () => {
  it('stores, clears on empty, and caps the size', () => {
    const s = useDrafts.getState();
    s.set('1', 'salom');
    expect(useDrafts.getState().drafts['1']).toBe('salom');
    s.set('1', '   ');
    expect(useDrafts.getState().drafts['1']).toBeUndefined();
    for (let i = 0; i < 130; i++) s.set(`c${i}`, 'x');
    expect(Object.keys(useDrafts.getState().drafts).length).toBe(100);
    expect(useDrafts.getState().drafts['c129']).toBe('x'); // oldest dropped, newest kept
    expect(useDrafts.getState().drafts['c0']).toBeUndefined();
  });
});
