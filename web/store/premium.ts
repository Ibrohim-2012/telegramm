'use client';
import { create } from 'zustand';
import { api, ApiError } from '@/lib/api';
import type { Accent, PremiumInfo } from '@/lib/types';
import { toastError } from './messages';

interface PremiumStore {
  info: PremiumInfo | null;
  load: () => Promise<void>;
  startTrial: () => Promise<boolean>;
  redeem: (code: string) => Promise<{ ok: true } | { ok: false; code: string }>;
  update: (patch: { emojiStatus?: string | null; accent?: Accent | null }) => Promise<boolean>;
  reset: () => void;
}

export const usePremium = create<PremiumStore>((set, get) => ({
  info: null,
  load: async () => {
    try {
      set({ info: await api<PremiumInfo>('/api/premium') });
    } catch {
      /* premium is optional: the app works without it */
    }
  },
  startTrial: async () => {
    try {
      set({ info: await api<PremiumInfo>('/api/premium/trial', { method: 'POST', body: {} }) });
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  },
  redeem: async (code) => {
    try {
      set({ info: await api<PremiumInfo>('/api/premium/redeem', { body: { code } }) });
      return { ok: true };
    } catch (e) {
      return { ok: false, code: e instanceof ApiError ? e.code : 'UNKNOWN' };
    }
  },
  update: async (patch) => {
    try {
      set({ info: await api<PremiumInfo>('/api/premium/settings', { body: patch }) });
      return true;
    } catch (e) {
      toastError(e);
      await get().load();
      return false;
    }
  },
  reset: () => set({ info: null }),
}));

export const isPremium = () => usePremium.getState().info?.active ?? false;
