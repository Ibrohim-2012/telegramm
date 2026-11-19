'use client';
import { create } from 'zustand';
import { api, ApiError } from '@/lib/api';
import { errorText } from '@/lib/i18n';
import { applyReaction } from '@/lib/social';
import type { Message } from '@/lib/types';
import { useAuth } from './auth';
import { useToast } from './toast';
import { useUi } from './ui';

const PAGE = 40;
const MAX_THREADS = 8; // cap memory: least recently opened chats are dropped

export interface Thread {
  items: Message[];
  hasMore: boolean;
  status: 'loading' | 'ready' | 'error';
  older: 'idle' | 'loading' | 'error';
}

interface MessagesStore {
  threads: Record<string, Thread>;
  order: string[];
  open: (id: string) => Promise<void>;
  /** Re-fetch the newest page (after a socket reconnect) and merge without duplicates. */
  refresh: (id: string) => Promise<void>;
  loadOlder: (id: string) => Promise<void>;
  send: (dialogId: string, text: string, replyTo?: number) => Promise<void>;
  react: (dialogId: string, id: number, emoji: string | null) => Promise<void>;
  /** Loads older pages until the message is present, then asks the list to scroll to it. */
  jumpTo: (dialogId: string, id: number) => Promise<boolean>;
  jump: { dialogId: string; id: number; n: number } | null;
  retry: (dialogId: string, tempId: number) => Promise<void>;
  edit: (dialogId: string, id: number, text: string) => Promise<boolean>;
  remove: (dialogId: string, ids: number[], revoke: boolean) => Promise<void>;
  forward: (fromId: string, ids: number[], toId: string) => Promise<boolean>;
  applyNew: (m: Message) => void;
  applyEdit: (m: Message) => void;
  applyDelete: (dialogId: string, ids: number[]) => void;
  applyRead: (dialogId: string, maxId: number) => void;
  reset: () => void;
}

/** Pending (negative id) messages sort after every confirmed one, in send order. */
const rank = (m: Message) => (m.id > 0 ? m.id : 1e12 - m.id);

/** Dedupe by id and keep chronological order. */
export const mergeMessages = (a: Message[], b: Message[]): Message[] => {
  const map = new Map<number, Message>();
  for (const m of a) map.set(m.id, m);
  for (const m of b) map.set(m.id, m);
  return [...map.values()].sort((x, y) => rank(x) - rank(y));
};

const fail = (e: unknown) => {
  if (e instanceof ApiError && (e.code === 'AUTH_KEY_UNREGISTERED' || e.code === 'ACCESS_REQUIRED')) void useAuth.getState().init();
};

export const toastError = (e: unknown) => {
  fail(e);
  const code = e instanceof ApiError ? e.code : 'UNKNOWN';
  const secs = e instanceof ApiError && e.retryAfter ? ` (${e.retryAfter}s)` : '';
  useToast.getState().show(errorText(useUi.getState().lang, code) + secs, 'error');
};

let tempSeq = 0;

export const useMessages = create<MessagesStore>((set, get) => {
  const patchThread = (id: string, fn: (t: Thread) => Partial<Thread>) =>
    set((s) => {
      const cur = s.threads[id];
      return cur ? { threads: { ...s.threads, [id]: { ...cur, ...fn(cur) } } } : s;
    });

  const mapAll = (fn: (m: Message) => Message | null, only?: string) =>
    set((s) => {
      const threads: Record<string, Thread> = {};
      for (const [id, t] of Object.entries(s.threads)) {
        threads[id] = only && only !== id ? t : { ...t, items: t.items.flatMap((m) => fn(m) ?? []) };
      }
      return { threads };
    });

  const postSend = async (dialogId: string, text: string, replyTo: number | undefined, tempId: number) => {
    try {
      const m = await api<Message>(`/api/dialogs/${dialogId}/messages`, { body: { text, replyTo } });
      patchThread(dialogId, (t) => ({ items: mergeMessages(t.items.filter((x) => x.id !== tempId), [m]) }));
    } catch (e) {
      patchThread(dialogId, (t) => ({ items: t.items.map((x) => (x.id === tempId ? { ...x, status: 'failed' as const } : x)) }));
      toastError(e);
    }
  };

  return {
    threads: {},
    order: [],
    jump: null,
    open: async (id) => {
      const existing = get().threads[id];
      if (existing?.status === 'loading') return; // request already in flight
      set((s) => {
        const order = [id, ...s.order.filter((x) => x !== id)];
        const threads = { ...s.threads };
        for (const drop of order.slice(MAX_THREADS)) delete threads[drop];
        if (!threads[id]) threads[id] = { items: [], hasMore: false, status: 'loading', older: 'idle' };
        else if (threads[id]!.status === 'error') threads[id] = { ...threads[id]!, status: 'loading' };
        return { order: order.slice(0, MAX_THREADS), threads };
      });
      if (existing && existing.status === 'ready') return; // cached; realtime keeps it fresh
      try {
        const r = await api<{ items: Message[]; hasMore: boolean }>(`/api/dialogs/${id}/history?limit=${PAGE}`);
        patchThread(id, (t) => ({ items: mergeMessages(t.items, r.items), hasMore: r.hasMore, status: 'ready' }));
      } catch (e) {
        fail(e);
        patchThread(id, () => ({ status: 'error' }));
      }
    },
    refresh: async (id) => {
      if (get().threads[id]?.status !== 'ready') return;
      try {
        const r = await api<{ items: Message[]; hasMore: boolean }>(`/api/dialogs/${id}/history?limit=${PAGE}`);
        patchThread(id, (t) => {
          const lowest = r.items[0]?.id ?? 0;
          // Drop confirmed messages inside the refreshed window that the server no longer has (deleted while offline).
          const keep = t.items.filter((m) => m.id <= 0 || m.id < lowest || r.items.some((x) => x.id === m.id));
          return { items: mergeMessages(keep, r.items) };
        });
      } catch (e) {
        fail(e);
      }
    },
    loadOlder: async (id) => {
      const t = get().threads[id];
      const first = t?.items.find((m) => m.id > 0);
      if (!t || !first || !t.hasMore || t.older === 'loading') return;
      patchThread(id, () => ({ older: 'loading' }));
      try {
        const r = await api<{ items: Message[]; hasMore: boolean }>(
          `/api/dialogs/${id}/history?limit=${PAGE}&beforeId=${first.id}`,
        );
        patchThread(id, (cur) => ({ items: mergeMessages(cur.items, r.items), hasMore: r.hasMore, older: 'idle' }));
      } catch (e) {
        fail(e);
        patchThread(id, () => ({ older: 'error' }));
      }
    },
    send: async (dialogId, text, replyTo) => {
      const tempId = -++tempSeq;
      const temp: Message = { id: tempId, dialogId, text, date: Math.floor(Date.now() / 1000), out: true, read: false, replyToId: replyTo, status: 'sending' };
      patchThread(dialogId, (t) => ({ items: mergeMessages(t.items, [temp]) }));
      await postSend(dialogId, text, replyTo, tempId);
    },
    react: async (dialogId, id, emoji) => {
      const before = get().threads[dialogId]?.items.find((x) => x.id === id);
      if (!before) return;
      const apply = (reactions: Message['reactions']) =>
        patchThread(dialogId, (t) => ({ items: t.items.map((x) => (x.id === id ? { ...x, reactions } : x)) }));
      apply(applyReaction(before.reactions, emoji)); // instant
      try {
        const m = await api<Message>(`/api/dialogs/${dialogId}/messages/${id}/reaction`, { body: { emoji } });
        get().applyEdit(m);
      } catch (e) {
        apply(before.reactions); // roll back
        toastError(e);
      }
    },
    jumpTo: async (dialogId, id) => {
      for (let i = 0; i < 25; i++) {
        const t = get().threads[dialogId];
        if (!t) return false;
        if (t.items.some((x) => x.id === id)) {
          set((s) => ({ jump: { dialogId, id, n: (s.jump?.n ?? 0) + 1 } }));
          return true;
        }
        if (!t.hasMore) return false;
        await get().loadOlder(dialogId);
        if (get().threads[dialogId]?.older === 'error') return false;
      }
      return false;
    },
    retry: async (dialogId, tempId) => {
      const m = get().threads[dialogId]?.items.find((x) => x.id === tempId);
      if (!m) return;
      patchThread(dialogId, (t) => ({ items: t.items.map((x) => (x.id === tempId ? { ...x, status: 'sending' as const } : x)) }));
      await postSend(dialogId, m.text, m.replyToId, tempId);
    },
    edit: async (dialogId, id, text) => {
      try {
        const m = await api<Message>(`/api/dialogs/${dialogId}/messages/${id}`, { method: 'PATCH', body: { text } });
        get().applyEdit(m);
        return true;
      } catch (e) {
        toastError(e);
        return false;
      }
    },
    remove: async (dialogId, ids, revoke) => {
      try {
        await api(`/api/dialogs/${dialogId}/messages/delete`, { body: { ids, revoke } });
        get().applyDelete(dialogId, ids);
      } catch (e) {
        toastError(e);
      }
    },
    forward: async (fromId, ids, toId) => {
      try {
        const r = await api<{ items: Message[] }>(`/api/dialogs/${fromId}/forward`, { body: { ids, toId } });
        for (const m of r.items) get().applyNew(m);
        return true;
      } catch (e) {
        toastError(e);
        return false;
      }
    },
    applyNew: (m) => patchThread(m.dialogId, (t) => ({ items: mergeMessages(t.items, [m]) })),
    applyEdit: (m) => patchThread(m.dialogId, (t) => ({ items: mergeMessages(t.items, [m]) })),
    applyDelete: (dialogId, ids) => {
      const gone = new Set(ids);
      // Telegram only names the chat for channels; other message ids are unique per account.
      mapAll((m) => (gone.has(m.id) ? null : m), dialogId || undefined);
    },
    applyRead: (dialogId, maxId) =>
      mapAll((m) => (m.out && !m.read && m.id > 0 && m.id <= maxId ? { ...m, read: true } : m), dialogId),
    reset: () => set({ threads: {}, order: [], jump: null }),
  };
});
