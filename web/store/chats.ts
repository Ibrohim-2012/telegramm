'use client';
import { create } from 'zustand';
import { api, ApiError } from '@/lib/api';
import { folderMatches } from '@/lib/folders';
import type { Dialog, Filter, Folder } from '@/lib/types';
import { toastError } from './messages';
import { useAuth } from './auth';

export const PAGE = 40;
const MAX_DIALOGS = 300;

interface GlobalSearch {
  q: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: Dialog[];
}

interface ChatsStore {
  dialogs: Dialog[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  hasMore: boolean;
  loadingMore: boolean;
  filter: Filter;
  query: string;
  selectedId: string | null;
  /** A chat opened from global search that is not in the dialog list yet. */
  peer: Dialog | null;
  infoOpen: boolean;
  connected: boolean;
  /** The signed-in user's id: their own chat is "Saved Messages". */
  meId: string | null;
  setMeId: (id: string | null) => void;
  togglePin: (d: Dialog) => Promise<void>;
  toggleMute: (d: Dialog) => Promise<void>;
  markAllRead: (d: Dialog) => Promise<void>;
  global: GlobalSearch;
  folders: Folder[];
  loadFolders: () => Promise<void>;
  /** dialogId -> someone is typing (auto-expires). */
  typing: Record<string, boolean>;
  setTyping: (dialogId: string, typing: boolean) => void;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  setFilter: (f: Filter) => void;
  /** Main list or the archive. */
  view: 'main' | 'archive';
  setView: (v: 'main' | 'archive') => void;
  toggleArchive: (d: Dialog) => Promise<void>;
  setQuery: (q: string) => void;
  select: (id: string | null) => void;
  selectPeer: (d: Dialog) => void;
  toggleInfo: (open?: boolean) => void;
  setConnected: (c: boolean) => void;
  applyUpdate: (d: Dialog) => void;
  searchGlobal: (q: string) => Promise<void>;
  reset: () => void;
}

export const sortDialogs = (list: Dialog[]) =>
  [...list].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (a.pinned && b.pinned ? (a.pinOrder ?? 0) - (b.pinOrder ?? 0) : 0) || // pinned chats keep Telegram's own order
      (b.lastMessage?.date ?? 0) - (a.lastMessage?.date ?? 0),
  );

/** Upsert by id so reloads and reconnects never create duplicates. */
export const mergeDialogs = (base: Dialog[], incoming: Dialog[]): Dialog[] => {
  const map = new Map(base.map((d) => [d.id, d]));
  for (const d of incoming) map.set(d.id, d);
  return sortDialogs([...map.values()]);
};

const idleGlobal: GlobalSearch = { q: '', status: 'idle', items: [] };
let globalToken = 0;
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

const handleAuthError = (e: unknown) => {
  if (e instanceof ApiError && (e.code === 'AUTH_KEY_UNREGISTERED' || e.code === 'ACCESS_REQUIRED')) void useAuth.getState().init();
};

export const useChats = create<ChatsStore>((set, get) => ({
  dialogs: [],
  status: 'idle',
  hasMore: false,
  loadingMore: false,
  filter: 'all',
  query: '',
  selectedId: null,
  peer: null,
  infoOpen: false,
  connected: false,
  meId: null,
  setMeId: (meId) => set({ meId }),
  togglePin: async (d) => {
    const next = !d.pinned;
    get().applyUpdate({ ...d, pinned: next });
    try {
      await api(`/api/dialogs/${d.id}/pin`, { body: { pinned: next } });
    } catch (e) {
      get().applyUpdate(d);
      toastError(e);
    }
  },
  toggleMute: async (d) => {
    const next = !d.muted;
    get().applyUpdate({ ...d, muted: next });
    try {
      await api(`/api/dialogs/${d.id}/mute`, { body: { muted: next } });
    } catch (e) {
      get().applyUpdate(d);
      toastError(e);
    }
  },
  markAllRead: async (d) => {
    get().applyUpdate({ ...d, unread: 0 });
    try {
      await api(`/api/dialogs/${d.id}/read`, { body: { maxId: 0 } });
    } catch (e) {
      get().applyUpdate(d);
      toastError(e);
    }
  },
  global: idleGlobal,
  folders: [],
  loadFolders: async () => {
    try {
      const { items } = await api<{ items: Folder[] }>('/api/folders');
      set((s) => ({ folders: items, filter: s.filter.startsWith('folder:') && !items.some((f) => `folder:${f.id}` === s.filter) ? 'all' : s.filter }));
    } catch (e) {
      handleAuthError(e); // folders are optional: the default tabs stay if this fails
    }
  },
  typing: {},
  setTyping: (dialogId, typing) => {
    clearTimeout(typingTimers.get(dialogId));
    if (typing) typingTimers.set(dialogId, setTimeout(() => get().setTyping(dialogId, false), 6000));
    set((s) => {
      if (!!s.typing[dialogId] === typing) return s;
      const next = { ...s.typing };
      if (typing) next[dialogId] = true;
      else delete next[dialogId];
      return { typing: next };
    });
  },
  load: async () => {
    if (get().dialogs.length === 0) set({ status: 'loading' });
    try {
      const { items, total } = await api<{ items: Dialog[]; total: number }>(`/api/dialogs?limit=${PAGE}&offset=0`);
      set((s) => {
        const dialogs = mergeDialogs(s.dialogs, items);
        return { dialogs, status: 'ready', hasMore: dialogs.length < total && dialogs.length < MAX_DIALOGS };
      });
    } catch (e) {
      handleAuthError(e);
      if (get().dialogs.length === 0) set({ status: 'error' });
    }
  },
  loadMore: async () => {
    const s = get();
    if (s.loadingMore || !s.hasMore || s.status !== 'ready') return;
    set({ loadingMore: true });
    try {
      const { items, total } = await api<{ items: Dialog[]; total: number }>(
        `/api/dialogs?limit=${PAGE}&offset=${s.dialogs.length}`,
      );
      set((st) => {
        const dialogs = mergeDialogs(st.dialogs, items);
        const grew = dialogs.length > st.dialogs.length;
        return { dialogs, loadingMore: false, hasMore: grew && dialogs.length < total && dialogs.length < MAX_DIALOGS };
      });
    } catch (e) {
      handleAuthError(e);
      set({ loadingMore: false, hasMore: false });
    }
  },
  setFilter: (filter) => set({ filter }),
  view: 'main',
  setView: (view) => set({ view, filter: 'all', query: '' }),
  toggleArchive: async (d) => {
    const next = !d.archived;
    get().applyUpdate({ ...d, archived: next || undefined, pinned: next ? false : d.pinned });
    try {
      await api(`/api/dialogs/${d.id}/archive`, { body: { archived: next } });
    } catch (e) {
      get().applyUpdate(d);
      handleAuthError(e);
      toastError(e);
    }
  },
  setQuery: (query) => {
    set({ query });
    if (query.trim().replace(/^@/, '').length < 2) {
      globalToken++;
      set({ global: idleGlobal });
    }
  },
  select: (selectedId) => set({ selectedId, peer: null, infoOpen: false }),
  selectPeer: (d) => set({ selectedId: d.id, peer: d, infoOpen: false }),
  toggleInfo: (open) => set((s) => ({ infoOpen: open ?? !s.infoOpen })),
  setConnected: (connected) => set({ connected }),
  applyUpdate: (d) => set((s) => ({ dialogs: mergeDialogs(s.dialogs, [d]) })),
  searchGlobal: async (q) => {
    const token = ++globalToken;
    set({ global: { q, status: 'loading', items: [] } });
    try {
      const { items } = await api<{ items: Dialog[] }>(`/api/search?q=${encodeURIComponent(q)}`);
      if (token === globalToken) set({ global: { q, status: 'ready', items } });
    } catch (e) {
      handleAuthError(e);
      if (token === globalToken) set({ global: { q, status: 'error', items: [] } });
    }
  },
  reset: () => {
    globalToken++;
    set({
      dialogs: [],
      status: 'idle',
      hasMore: false,
      loadingMore: false,
      selectedId: null,
      peer: null,
      infoOpen: false,
      query: '',
      filter: 'all',
      global: idleGlobal,
      typing: {},
      view: 'main',
      meId: null,
      folders: [],
    });
  },
}));

export function selectVisible(s: Pick<ChatsStore, 'dialogs' | 'filter' | 'query' | 'folders'> & { view?: 'main' | 'archive' }): Dialog[] {
  const q = s.query.trim().replace(/^@/, '').toLowerCase();
  const folder = s.filter.startsWith('folder:') ? s.folders.find((f) => `folder:${f.id}` === s.filter) : undefined;
  return s.dialogs.filter((d) => {
    // Archived chats live in the archive; searching looks everywhere.
    if (!q && !!d.archived !== (s.view === 'archive')) return false;
    if (folder) {
      if (!folderMatches(folder, d)) return false;
    } else if (s.filter === 'unread' ? d.unread === 0 : s.filter !== 'all' && !s.filter.startsWith('folder:') && d.kind !== s.filter) return false;
    return !q || d.title.toLowerCase().includes(q) || (d.username?.toLowerCase().includes(q) ?? false);
  });
}

export function useSelectedDialog(): Dialog | null {
  return useChats((s) => s.dialogs.find((d) => d.id === s.selectedId) ?? (s.peer?.id === s.selectedId ? s.peer : null));
}
