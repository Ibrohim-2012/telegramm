'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DraftsStore {
  drafts: Record<string, string>;
  set: (dialogId: string, text: string) => void;
}

const MAX = 100; // keep the stored map small

/** Unsent text per chat, kept in this browser only. */
export const useDrafts = create<DraftsStore>()(
  persist(
    (set) => ({
      drafts: {},
      set: (id, text) =>
        set((s) => {
          const next = { ...s.drafts };
          if (text.trim()) {
            delete next[id]; // re-insert so the newest draft is last
            next[id] = text;
          } else delete next[id];
          const keys = Object.keys(next);
          for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete next[k];
          return { drafts: next };
        }),
    }),
    { name: 'mt-drafts', skipHydration: true },
  ),
);
