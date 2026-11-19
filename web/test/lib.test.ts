import { describe, expect, it } from 'vitest';
import { formatDialogTime, initials } from '@/lib/format';
import { buildEntries, dayLabel } from '@/lib/messages';
import type { Dialog, Message } from '@/lib/types';
import { mergeDialogs } from '@/store/chats';
import { mergeMessages } from '@/store/messages';

const at = (y: number, mo: number, d: number, h = 12, mi = 0) => Math.floor(new Date(y, mo, d, h, mi).getTime() / 1000);
const msg = (id: number, date: number, out = false, senderName?: string): Message => ({ id, dialogId: '1', text: `m${id}`, date, out, read: true, senderName });
const dlg = (id: string, date: number, extra: Partial<Dialog> = {}): Dialog => ({
  id, kind: 'private', title: id, unread: 0, pinned: false, muted: false, online: false,
  lastMessage: { text: '', date, out: false, read: true }, ...extra,
});

describe('mergeMessages', () => {
  it('dedupes by id and sorts ascending', () => {
    const r = mergeMessages([msg(3, 3), msg(1, 1)], [msg(2, 2), msg(3, 3)]);
    expect(r.map((m) => m.id)).toEqual([1, 2, 3]);
  });
});

describe('mergeMessages pending', () => {
  it('keeps unconfirmed (negative id) messages last, in send order', () => {
    const r = mergeMessages([msg(5, 5)], [msg(-2, 9), msg(-1, 8), msg(6, 6)]);
    expect(r.map((m) => m.id)).toEqual([5, 6, -1, -2]);
  });
  it('replaces a pending message once the confirmed one arrives', () => {
    const r = mergeMessages([msg(5, 5), msg(-1, 6)].filter((m) => m.id !== -1), [msg(6, 6)]);
    expect(r.map((m) => m.id)).toEqual([5, 6]);
  });
});

describe('mergeDialogs', () => {
  it('upserts, keeps pinned first then newest', () => {
    const r = mergeDialogs([dlg('a', 10), dlg('b', 20)], [dlg('a', 30), dlg('c', 5, { pinned: true })]);
    expect(r.map((d) => d.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('buildEntries', () => {
  it('adds date separators and groups close messages', () => {
    const e = buildEntries([msg(1, at(2026, 0, 1, 10)), msg(2, at(2026, 0, 1, 10, 1)), msg(3, at(2026, 0, 1, 10, 2), true), msg(4, at(2026, 0, 2, 9))]);
    expect(e.map((x) => x.type)).toEqual(['date', 'msg', 'msg', 'msg', 'date', 'msg']);
    const m = e.filter((x) => x.type === 'msg');
    expect(m.map((x) => [x.first, x.last])).toEqual([[true, false], [false, true], [true, true], [true, true]]);
  });
  it('splits groups after a long gap or different sender', () => {
    const m = buildEntries([msg(1, at(2026, 0, 1, 10), false, 'A'), msg(2, at(2026, 0, 1, 10, 1), false, 'B'), msg(3, at(2026, 0, 1, 11), false, 'B')]).filter((x) => x.type === 'msg');
    expect(m.map((x) => x.first)).toEqual([true, true, true]);
  });
});

describe('time formatting (local time)', () => {
  const now = new Date(2026, 5, 15, 12, 0);
  it('formats dialog time', () => {
    expect(formatDialogTime(at(2026, 5, 15, 9, 5), now)).toBe('09:05');
    expect(formatDialogTime(at(2026, 0, 3), now)).toBe('03.01.26');
  });
  it('labels days', () => {
    const l = { today: 'Bugun', yesterday: 'Kecha' };
    expect(dayLabel(at(2026, 5, 15), now, l, 'en')).toBe('Bugun');
    expect(dayLabel(at(2026, 5, 14), now, l, 'en')).toBe('Kecha');
    expect(dayLabel(at(2026, 5, 1), now, l, 'en')).toBe('June 1');
    expect(dayLabel(at(2026, 5, 1), now, l, 'uz')).toBe('1-iyun');
    expect(dayLabel(at(2025, 11, 31), now, l, 'ru')).toBe('31 декабря 2025');
  });
  it('initials', () => {
    expect(initials('Aziza Karimova')).toBe('AK');
    expect(initials('Oila 👨‍👩‍👧')).toBe('O');
  });
});
