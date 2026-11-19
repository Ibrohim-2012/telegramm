'use client';
import { create } from 'zustand';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

interface ToastStore {
  toasts: Toast[];
  show: (text: string, kind?: Toast['kind']) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToast = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (text, kind = 'info') => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, kind }] }));
    setTimeout(() => get().dismiss(id), kind === 'error' ? 5000 : 2200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
