'use client';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { api, API_URL } from '@/lib/api';
import { badgeTitle, notificationText, playChime, shouldNotify } from '@/lib/notify';
import { translate } from '@/lib/i18n';
import type { Dialog, Message } from '@/lib/types';
import { usePremium } from '@/store/premium';
import { applyTheme, PREMIUM_WALLPAPERS, useUi } from '@/store/ui';
import { useAuth } from '@/store/auth';
import { useChats } from '@/store/chats';
import { useMessages } from '@/store/messages';
import { useDrafts } from '@/store/drafts';

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useUi((s) => s.theme);
  const fontSize = useUi((s) => s.fontSize);
  const chosenWp = useUi((s) => s.wallpaper);
  const premium = usePremium((s) => s.info);
  // Exclusive backgrounds fall back to classic when Premium is not active.
  const wallpaper = PREMIUM_WALLPAPERS.includes(chosenWp) && !premium?.active ? 'classic' : chosenWp;
  const accent = premium?.active ? premium.settings.accent : undefined;
  const lang = useUi((s) => s.lang);
  const authState = useAuth((s) => s.state);
  const unread = useChats((s) => s.dialogs.reduce((n, d) => n + (d.muted || d.archived ? 0 : d.unread), 0));

  // "(3) Mening Telegramim" in the tab title.
  useEffect(() => {
    document.title = badgeTitle(translate(lang, 'appName'), authState === 'ready' ? unread : 0);
  }, [unread, lang, authState]);

  useEffect(() => {
    void Promise.resolve(useDrafts.persist.rehydrate());
    void Promise.resolve(useUi.persist.rehydrate()).then(() => void useAuth.getState().init());
  }, []);

  useEffect(() => {
    applyTheme(theme, fontSize, wallpaper);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system', fontSize, wallpaper);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme, fontSize, wallpaper]);

  // One delegated listener adds the ripple to any element marked data-ripple.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const host = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-ripple]');
      if (!host || (host as HTMLButtonElement).disabled) return;
      const r = host.getBoundingClientRect();
      const d = Math.max(r.width, r.height) * 2;
      const el = document.createElement('span');
      el.className = 'ripple';
      el.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
      host.appendChild(el);
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  useEffect(() => {
    if (accent) document.documentElement.dataset.accent = accent;
    else delete document.documentElement.dataset.accent;
  }, [accent]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // One socket while logged in; cleaned up on logout/unmount. Every handler dedupes by id in the stores.
  useEffect(() => {
    if (authState !== 'ready') return;
    void api<{ id: string }>('/api/me').then((m) => useChats.getState().setMeId(m.id)).catch(() => {});
    void useChats.getState().loadFolders();
    void usePremium.getState().load();
    const socket = io(API_URL, { withCredentials: true, reconnectionDelayMax: 8000 });
    const chats = () => useChats.getState();
    const msgs = () => useMessages.getState();

    socket.on('connect', () => {
      chats().setConnected(true);
      void chats().load();
      const open = chats().selectedId;
      if (open) void msgs().refresh(open); // catch up on anything missed while disconnected
    });
    socket.on('disconnect', () => chats().setConnected(false));
    socket.on('dialog:update', (e: { dialog: Dialog }) => chats().applyUpdate(e.dialog));
    socket.on('message:new', (e: { message: Message }) => {
      const m = e.message;
      msgs().applyNew(m);
      const ui = useUi.getState();
      const d = chats().dialogs.find((x) => x.id === m.dialogId);
      const attentive = document.visibilityState === 'visible' && document.hasFocus();
      if (shouldNotify({ out: m.out, muted: d?.muted ?? false, enabled: ui.notify || ui.sound, dialogId: m.dialogId, selectedId: chats().selectedId, attentive })) {
        if (ui.sound) playChime();
        if (ui.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const { title, body } = notificationText(d, m, ui.notifyPreview, translate(ui.lang, 'appName'));
          const n = new Notification(title, { body, tag: m.dialogId, silent: true });
          n.onclick = () => {
            window.focus();
            chats().select(m.dialogId);
            n.close();
          };
        }
      }
      if (!m.out && m.dialogId === chats().selectedId && document.visibilityState === 'visible') {
        void api(`/api/dialogs/${m.dialogId}/read`, { body: { maxId: m.id } }).catch(() => {});
      }
    });
    socket.on('message:edit', (e: { message: Message }) => msgs().applyEdit(e.message));
    socket.on('message:delete', (e: { dialogId: string; ids: number[] }) => msgs().applyDelete(e.dialogId, e.ids));
    socket.on('typing', (e: { dialogId: string; typing: boolean }) => chats().setTyping(e.dialogId, e.typing));
    socket.on('read', (e: { dialogId: string; maxId: number }) => msgs().applyRead(e.dialogId, e.maxId));
    const onOnline = () => !socket.connected && socket.connect();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      socket.removeAllListeners();
      socket.disconnect();
      chats().setConnected(false);
    };
  }, [authState]);

  return <>{children}</>;
}
