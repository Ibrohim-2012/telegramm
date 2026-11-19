'use client';
import { create } from 'zustand';

interface SelectionStore {
  dialogId: string | null;
  ids: number[];
  start: (dialogId: string, id: number) => void;
  toggle: (id: number) => void;
  clear: () => void;
}

/** Multi-select mode for messages (forward / delete several at once). */
export const useSelection = create<SelectionStore>((set) => ({
  dialogId: null,
  ids: [],
  start: (dialogId, id) => set({ dialogId, ids: [id] }),
  toggle: (id) =>
    set((s) => {
      const ids = s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id];
      return ids.length ? { ids } : { dialogId: null, ids: [] }; // deselecting the last one leaves the mode
    }),
  clear: () => set({ dialogId: null, ids: [] }),
}));
