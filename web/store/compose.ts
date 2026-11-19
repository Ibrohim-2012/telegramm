'use client';
import { create } from 'zustand';
import type { Message } from '@/lib/types';

interface ComposeStore {
  replyTo: Message | null;
  editing: Message | null;
  setReply: (m: Message | null) => void;
  setEdit: (m: Message | null) => void;
  clear: () => void;
}

export const useCompose = create<ComposeStore>((set) => ({
  replyTo: null,
  editing: null,
  setReply: (replyTo) => set({ replyTo, editing: null }),
  setEdit: (editing) => set({ editing, replyTo: null }),
  clear: () => set({ replyTo: null, editing: null }),
}));
