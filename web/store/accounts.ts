'use client';
import { create } from 'zustand';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { useAuth } from './auth';
import { useChats } from './chats';
import { useMessages, toastError } from './messages';
import { usePremium } from './premium';

export interface AccountInfo {
  slot: number;
  active: boolean;
  ready: boolean;
  me?: Me;
}

interface AccountsStore {
  items: AccountInfo[];
  max: number;
  load: () => Promise<void>;
  switchTo: (slot: number) => Promise<void>;
  add: () => Promise<void>;
  cancel: () => Promise<void>;
  logout: () => Promise<void>;
}

/** Forget everything of the previous account and load the one that is active now. */
export async function reloadAll() {
  const chats = useChats.getState();
  chats.reset();
  useMessages.getState().reset();
  void api<{ id: string }>('/api/me').then((m) => useChats.getState().setMeId(m.id)).catch(() => {});
  void useChats.getState().load();
  void useChats.getState().loadFolders();
  void usePremium.getState().load();
}

const clearStores = () => {
  useChats.getState().reset();
  useMessages.getState().reset();
};

export const useAccounts = create<AccountsStore>((set, get) => ({
  items: [],
  max: 3,
  load: async () => {
    try {
      const r = await api<{ items: AccountInfo[]; max: number }>('/api/accounts');
      set({ items: r.items, max: r.max });
    } catch {
      /* single-account servers have no such route */
    }
  },
  switchTo: async (slot) => {
    try {
      await api('/api/accounts/' + slot + '/switch', { method: 'POST', body: {} });
      await reloadAll();
      await get().load();
    } catch (e) {
      toastError(e);
    }
  },
  add: async () => {
    try {
      await api('/api/accounts', { method: 'POST', body: {} });
      clearStores();
      await useAuth.getState().init(); // the server is logged out for the new slot: the login screen appears
      await get().load();
    } catch (e) {
      toastError(e);
    }
  },
  cancel: async () => {
    try {
      await api('/api/accounts/cancel', { method: 'POST', body: {} });
    } finally {
      await useAuth.getState().init();
      await get().load();
    }
  },
  logout: async () => {
    await useAuth.getState().logout();
    clearStores();
    usePremium.getState().reset();
    if (useAuth.getState().state === 'ready') await reloadAll(); // another account took over
    await get().load();
  },
}));
