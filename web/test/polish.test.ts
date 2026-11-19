import { describe, expect, it } from 'vitest';
import { badgeTitle, notificationText, shouldNotify } from '@/lib/notify';
import { firstUrl } from '@/lib/richtext';
import type { Dialog, Message } from '@/lib/types';

const base = { out: false, muted: false, enabled: true, dialogId: '1', selectedId: null as string | null, attentive: true };

describe('shouldNotify', () => {
  it('notifies for incoming messages in other chats or hidden tabs', () => {
    expect(shouldNotify({ ...base })).toBe(true);
    expect(shouldNotify({ ...base, selectedId: '2' })).toBe(true);
    expect(shouldNotify({ ...base, selectedId: '1', attentive: false })).toBe(true);
  });
  it('stays quiet for own, muted, disabled or already-visible chat', () => {
    expect(shouldNotify({ ...base, out: true })).toBe(false);
    expect(shouldNotify({ ...base, muted: true })).toBe(false);
    expect(shouldNotify({ ...base, enabled: false })).toBe(false);
    expect(shouldNotify({ ...base, selectedId: '1', attentive: true })).toBe(false);
  });
});

describe('notificationText', () => {
  const d: Dialog = { id: '1', kind: 'group', title: 'Oila', unread: 0, pinned: false, muted: false, online: false };
  const m: Message = { id: 1, dialogId: '1', text: '**Salom** dunyo', date: 1, out: false, read: true, senderName: 'Aziza' };
  it('shows sender and plain text, or hides text when previews are off', () => {
    expect(notificationText(d, m, true, 'App')).toEqual({ title: 'Oila', body: 'Aziza: Salom dunyo' });
    expect(notificationText(d, m, false, 'App').body).toBe('…');
  });
  it('labels media and truncates long text', () => {
    expect(notificationText(d, { ...m, text: '', media: { kind: 'photo' } }, true, 'App').body).toBe('Aziza: 📷');
    expect(notificationText(undefined, { ...m, text: 'x'.repeat(500) }, true, 'App').body.length).toBeLessThanOrEqual(140);
  });
});

describe('badgeTitle', () => {
  it('prefixes the unread count', () => {
    expect(badgeTitle('App', 0)).toBe('App');
    expect(badgeTitle('App', 3)).toBe('(3) App');
    expect(badgeTitle('App', 250)).toBe('(99+) App');
  });
});

describe('firstUrl', () => {
  it('finds bare, markdown and nested links; ignores code', () => {
    expect(firstUrl('see https://a.uz/x, ok')).toBe('https://a.uz/x');
    expect(firstUrl('[site](https://b.uz)')).toBe('https://b.uz');
    expect(firstUrl('**bold https://c.uz**')).toBe('https://c.uz');
    expect(firstUrl('`https://d.uz`')).toBeNull();
    expect(firstUrl('no links')).toBeNull();
  });
});
