'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { buildEntries, dayLabel } from '@/lib/messages';
import type { Dialog, Message } from '@/lib/types';
import { useChats } from '@/store/chats';
import { useCompose } from '@/store/compose';
import { useMessages } from '@/store/messages';
import { QUICK_REACTIONS } from '@/lib/social';
import { quoteBody, serviceText } from '@/lib/preview';
import { useToast } from '@/store/toast';
import { useT, useUi } from '@/store/ui';
import { ContextMenu, type MenuItem } from './ContextMenu';
const Lightbox = dynamic(() => import('./Lightbox').then((m) => m.Lightbox), { ssr: false });
const DeleteDialog = dynamic(() => import('./Dialogs').then((m) => m.DeleteDialog), { ssr: false });
const ForwardDialog = dynamic(() => import('./Dialogs').then((m) => m.ForwardDialog), { ssr: false });
import dynamic from 'next/dynamic';
import { UploadBubble } from './UploadBubble';
import { MessageBubble, type Quote } from './MessageBubble';
import { useUploads } from '@/store/uploads';
import { useSelection } from '@/store/selection';
import { IconChevronDown, IconCopy, IconForward, IconReply, IconSelect, IconTrash, IconPencil } from './icons';

const NEAR_TOP = 160;
const SHOW_JUMP = 400;
const NEAR_BOTTOM = 150;

function Skeleton() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 p-4" aria-hidden="true">
      {[60, 40, 70, 35, 55, 45].map((w, i) => (
        <div key={i} className={`skeleton h-11 ${i % 2 ? 'self-end' : 'self-start'}`} style={{ width: `${w}%`, maxWidth: 420 }} />
      ))}
    </div>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function MessageList({ dialog }: { dialog: Dialog }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const id = dialog.id;
  const thread = useMessages((s) => s.threads[id]);
  const ref = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; m: Message } | null>(null);
  const [deleting, setDeleting] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const selecting = useSelection((s) => s.dialogId === id);
  const selectedIds = useSelection((s) => s.ids);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [viewing, setViewing] = useState<Message | null>(null);
  const allUploads = useUploads((s) => s.items);
  const uploads = useMemo(() => allUploads.filter((u) => u.dialogId === id), [allUploads, id]);
  // For restoring position after older messages are prepended, and for first-open bottom snap.
  const prepend = useRef<{ height: number; firstId: number } | null>(null);
  const snapped = useRef<string | null>(null);
  const atBottom = useRef(true);
  const prevLast = useRef<number | undefined>(undefined);
  // How many messages were unread when the chat was opened -> where the "Unread messages" line goes.
  const unreadAtOpen = useRef(dialog.unread);
  const [dividerId, setDividerId] = useState<number | null>(null);
  const dividerDone = useRef(false);
  const readSent = useRef(0);
  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void useMessages.getState().open(id);
  }, [id]);

  const items = thread?.items;
  const entries = useMemo(() => buildEntries(items ?? []), [items]);
  const byId = useMemo(() => new Map((items ?? []).map((m) => [m.id, m])), [items]);
  const lastConfirmed = useMemo(() => items?.findLast((m) => m.id > 0)?.id ?? 0, [items]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Work out the divider once, when the first page arrives: the Nth incoming message from the end.
  useLayoutEffect(() => {
    if (dividerDone.current || thread?.status !== 'ready' || !items?.length) return;
    dividerDone.current = true;
    const n = unreadAtOpen.current;
    if (n <= 0) return;
    const incoming = items.filter((m) => !m.out && m.id > 0 && !m.service);
    if (n <= incoming.length) setDividerId(incoming[incoming.length - n]!.id);
  }, [thread?.status, items]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !items?.length) return;
    if (snapped.current !== id) {
      snapped.current = id;
      prevLast.current = items.at(-1)?.id;
      // Like Telegram: open at the first unread message when there is one, otherwise at the newest.
      const n = unreadAtOpen.current;
      const incoming = items.filter((m) => !m.out && m.id > 0 && !m.service);
      const first = n > 0 && n <= incoming.length ? incoming[incoming.length - n] : undefined;
      const target = first ? el.querySelector<HTMLElement>(`[data-mid="${first.id}"]`) : null;
      if (target) {
        el.scrollTop = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 72;
      } else el.scrollTop = el.scrollHeight;
      atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
      return;
    }
    const p = prepend.current;
    if (p && items[0] && items[0].id < p.firstId) {
      el.scrollTop += el.scrollHeight - p.height; // keep the same message under the cursor
      prepend.current = null;
    }
    // Something new at the bottom: follow it if we sent it or are already near the end; otherwise count it.
    const last = items.at(-1);
    if (last && prevLast.current !== undefined && prevLast.current !== last.id) {
      if (last.out || atBottom.current) scrollToBottom(false);
      else if (last.id > (prevLast.current ?? 0)) setNewBelow((n) => n + 1);
    }
    prevLast.current = last?.id;
  }, [items, id, scrollToBottom]);

  // Mark as read only what has really been on screen (opening a chat with thousands of unread must not clear them all).
  const markVisibleRead = useCallback(() => {
    const el = ref.current;
    const th = useMessages.getState().threads[id];
    if (!el || !th || th.status !== 'ready' || document.visibilityState !== 'visible') return;
    const cur = useChats.getState().dialogs.find((d) => d.id === id) ?? dialog;
    if (cur.unread === 0) return;
    const last = th.items.findLast((m) => m.id > 0)?.id ?? 0;
    let maxId = 0;
    if (atBottom.current) maxId = last;
    else {
      const box = el.getBoundingClientRect();
      for (const node of el.querySelectorAll<HTMLElement>('[data-mid]')) {
        const r = node.getBoundingClientRect();
        if (r.top < box.bottom - 8 && r.bottom > box.top) maxId = Math.max(maxId, Number(node.dataset.mid));
      }
    }
    if (maxId <= readSent.current) return;
    const seen = th.items.filter((m) => !m.out && m.id > readSent.current && m.id <= maxId && m.id > 0 && !m.service).length;
    readSent.current = maxId;
    useChats.getState().applyUpdate({ ...cur, unread: maxId >= last ? 0 : Math.max(0, cur.unread - seen) });
    void api(`/api/dialogs/${id}/read`, { body: { maxId } }).catch(() => {});
  }, [id, dialog]);

  const scheduleRead = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(markVisibleRead, 350);
  }, [markVisibleRead]);

  useEffect(() => {
    scheduleRead();
    document.addEventListener('visibilitychange', scheduleRead);
    return () => {
      clearTimeout(readTimer.current);
      document.removeEventListener('visibilitychange', scheduleRead);
    };
  }, [scheduleRead, thread?.status, lastConfirmed, dialog.unread]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = fromBottom < NEAR_BOTTOM;
    if (atBottom.current) setNewBelow(0);
    scheduleRead();
    setShowJump(fromBottom > SHOW_JUMP || newBelow > 0);
    const th = useMessages.getState().threads[id];
    const first = th?.items.find((m) => m.id > 0);
    if (el.scrollTop < NEAR_TOP && th?.hasMore && th.older === 'idle' && first) {
      prepend.current = { height: el.scrollHeight, firstId: first.id };
      void useMessages.getState().loadOlder(id);
    }
  };

  // If the first page doesn't fill the viewport, keep loading older messages.
  useEffect(() => {
    const el = ref.current;
    if (el && thread?.status === 'ready' && thread.hasMore && thread.older === 'idle' && el.scrollHeight <= el.clientHeight) onScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.items.length, thread?.status]);

  // A new upload shows up at the bottom: bring it into view.
  useEffect(() => {
    if (uploads.length) scrollToBottom(false);
  }, [uploads.length, scrollToBottom]);

  const openMedia = useCallback((m: Message) => setViewing(m), []);
  const openMenu = useCallback((m: Message, x: number, y: number) => setMenu({ x, y, m }), []);
  const retry = useCallback((m: Message) => void useMessages.getState().retry(id, m.id), [id]);
  const jump = useCallback((mid: number) => {
    const el = document.getElementById(`msg-${mid}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.firstElementChild?.animate([{ outline: '2px solid currentColor' }, { outline: '2px solid transparent' }], { duration: 1200 });
  }, []);

  const toggleSel = useCallback((m: Message) => useSelection.getState().toggle(m.id), []);
  const react = useCallback((m: Message, emoji: string | null) => void useMessages.getState().react(id, m.id, emoji), [id]);
  // Search results ask the list to scroll to a message (after loading older pages if necessary).
  const jumpReq = useMessages((s) => s.jump);
  useEffect(() => {
    if (jumpReq && jumpReq.dialogId === id) requestAnimationFrame(() => requestAnimationFrame(() => jump(jumpReq.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpReq?.n]);


  const labels = useMemo(
    () => ({ edited: t('msg.edited'), fwd: t('msg.fwd'), failed: t('msg.failed'), retry: t('msg.retry'), sending: t('msg.sending'), deleted: t('msg.deleted'), select: t('selection.select') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );

  const menuItems = (m: Message): MenuItem[] => {
    const confirmed = m.id > 0;
    const canWrite = dialog.kind !== 'channel';
    const list: MenuItem[] = [];
    if (confirmed && canWrite) list.push({ label: t('menu.reply'), icon: <IconReply size={20} />, onSelect: () => useCompose.getState().setReply(m) });
    if (m.text) list.push({
      label: t('menu.copy'),
      icon: <IconCopy size={20} />,
      onSelect: () => void copyText(m.text).then((ok) => ok && useToast.getState().show(t('toast.copied'))),
    });
    if (confirmed && m.out && canWrite) list.push({ label: t('menu.edit'), icon: <IconPencil size={20} />, onSelect: () => useCompose.getState().setEdit(m) });
    if (confirmed) list.push({ label: t('menu.forward'), icon: <IconForward size={20} />, onSelect: () => setForwarding(m) });
    if (confirmed) list.push({ label: t('menu.select'), icon: <IconSelect size={20} />, onSelect: () => useSelection.getState().start(id, m.id) });
    if (confirmed) list.push({ label: t('menu.delete'), icon: <IconTrash size={20} />, danger: true, onSelect: () => setDeleting(m) });
    return list;
  };

  if (!thread || thread.status === 'loading') return <Skeleton />;

  if (thread.status === 'error') {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div>
          <p className="font-semibold">{t('chat.loadError')}</p>
          <button
            onClick={() => void useMessages.getState().open(id)}
            className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink hover:brightness-110"
          >
            {t('chats.retry')}
          </button>
        </div>
      </div>
    );
  }

  const now = new Date();
  const dl = { today: t('chat.today'), yesterday: t('chat.yesterday') };
  const quoteOf = (m: Message): Quote | null => {
    if (m.replyToId === undefined) return null;
    const q = byId.get(m.replyToId);
    if (q) return { id: q.id, name: q.out ? t('you') : (q.senderName ?? dialog.title), text: quoteBody(q.text, q.media?.kind, t) };
    if (m.reply) return { id: m.replyToId, name: m.reply.out ? t('you') : (m.reply.name ?? dialog.title), text: quoteBody(m.reply.text, m.reply.media, t) };
    return null;
  };
  const groupChat = dialog.kind === 'group';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={ref} onScroll={onScroll} className="scroll-thin flex-1 overflow-y-auto px-3 py-2 md:px-6" role="log" aria-label={dialog.title}>
        <div className="mx-auto flex max-w-5xl flex-col">
          <div className="grid h-9 place-items-center text-xs text-muted" aria-live="polite">
            {thread.older === 'loading' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />}
            {thread.older === 'error' && (
              <button className="text-accent underline" onClick={() => void useMessages.getState().loadOlder(id)}>
                {t('chat.olderError')} · {t('chats.retry')}
              </button>
            )}
          </div>
          {thread.items.length === 0 && (
            <p className="mx-auto mt-10 rounded-full bg-surface/80 px-4 py-1.5 text-sm text-muted backdrop-blur">{t('chat.noMessages')}</p>
          )}
          {entries.map((e) =>
            e.type === 'date' ? (
              <div key={e.key} className="sticky top-2 z-10 my-2 select-none self-center rounded-full bg-black/30 px-3 py-1 text-sm font-medium text-white backdrop-blur-md">
                {dayLabel(e.ts, now, dl, lang)}
              </div>
            ) : e.m.service ? (
              <div key={e.key} data-testid="service" className="my-2 select-none self-center rounded-full bg-black/30 px-3 py-1 text-center text-sm text-white backdrop-blur-md">
                {serviceText(e.m.service.kind, e.m.service.name, e.m.service.extra, t)}
              </div>
            ) : (
              <MessageBubble
                key={e.key}
                avatar={groupChat && !e.m.out ? { id: e.m.senderId ?? e.m.senderName ?? '?', title: e.m.senderName ?? '?', photo: !!e.m.senderId } : null}
                unreadDivider={e.m.id === dividerId ? t('unread.divider') : undefined}
                m={e.m}
                first={e.first}
                last={e.last}
                showSender={dialog.kind === 'group'}
                quote={quoteOf(e.m)}
                labels={labels}
                selecting={selecting}
                selected={selectedSet.has(e.m.id)}
                onToggle={toggleSel}
                onMenu={openMenu}
                onRetry={retry}
                onJump={jump}
                onOpenMedia={openMedia}
                onReact={react}
              />
            ),
          )}
          {uploads.map((u) => (
            <UploadBubble key={u.id} u={u} />
          ))}
          <div className="h-2" />
        </div>
      </div>
      {(showJump || newBelow > 0) && (
        <button
          onClick={() => {
            scrollToBottom(true);
            setNewBelow(0);
          }}
          aria-label={t('chat.toBottom')}
          className="absolute bottom-4 right-4 grid h-11 w-11 animate-pop place-items-center rounded-full bg-surface text-muted shadow-[0_2px_8px_rgb(0_0_0/.25)] transition hover:text-ink"
        >
          {newBelow > 0 && (
            <span data-testid="new-below" aria-label={`${newBelow} ${t('chat.newBelow')}`} className="absolute -top-2.5 grid h-5 min-w-5 place-items-center rounded-full bg-badge-on px-1.5 text-xs font-medium leading-none text-white">
              {newBelow}
            </span>
          )}
          <IconChevronDown size={24} />
        </button>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.m)}
          onClose={() => setMenu(null)}
          reactions={
            menu.m.id > 0
              ? {
                  emojis: QUICK_REACTIONS,
                  current: menu.m.reactions?.find((r) => r.mine)?.emoji,
                  onPick: (e) => react(menu.m, menu.m.reactions?.find((r) => r.mine)?.emoji === e ? null : e),
                }
              : undefined
          }
        />
      )}
      {deleting && <DeleteDialog dialog={dialog} messages={[deleting]} onClose={() => setDeleting(null)} />}
      {viewing && <Lightbox m={viewing} onClose={() => setViewing(null)} />}
      {forwarding && <ForwardDialog from={dialog} messages={[forwarding]} onClose={() => setForwarding(null)} />}
    </div>
  );
}
