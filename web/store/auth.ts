'use client';
import { create } from 'zustand';
import { api, ApiError } from '@/lib/api';
import type { AuthState } from '@/lib/types';

interface AuthStore {
  state: AuthState | 'loading' | 'offline' | 'locked';
  mode: 'mock' | 'real' | null;
  busy: boolean;
  errorCode: string | null;
  retryAfter: number | null;
  init: () => Promise<void>;
  sendAccess: (token: string) => Promise<void>;
  sendPhone: (phone: string) => Promise<void>;
  sendCode: (code: string) => Promise<void>;
  sendPassword: (password: string) => Promise<void>;
  backToPhone: () => void;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthStore>((set, get) => {
  const run = async (fn: () => Promise<{ state: AuthState }>) => {
    set({ busy: true, errorCode: null, retryAfter: null });
    try {
      const { state } = await fn();
      set({ state, busy: false });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('UNKNOWN', 'Xatolik');
      set({ busy: false, errorCode: err.code, retryAfter: err.retryAfter ?? null });
    }
  };

  return {
    state: 'loading',
    mode: null,
    busy: false,
    errorCode: null,
    retryAfter: null,
    init: async () => {
      try {
        const s = await api<{ state: AuthState; mode: 'mock' | 'real' }>('/api/auth/status');
        set({ state: s.state, mode: s.mode });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'ACCESS_REQUIRED') set({ state: 'locked', errorCode: null });
        else set({ state: 'offline', errorCode: 'NETWORK' });
      }
    },
    sendAccess: async (token) => {
      set({ busy: true, errorCode: null });
      try {
        await api('/api/access', { body: { token } });
        set({ busy: false });
        await get().init();
      } catch (e) {
        set({ busy: false, errorCode: e instanceof ApiError ? e.code : 'UNKNOWN' });
      }
    },
    sendPhone: (phone) => run(() => api('/api/auth/phone', { body: { phone } })),
    sendCode: (code) => run(() => api('/api/auth/code', { body: { code } })),
    sendPassword: (password) => run(() => api('/api/auth/password', { body: { password } })),
    backToPhone: () => set({ state: 'logged_out', errorCode: null }),
    logout: async () => {
      await run(() => api('/api/auth/logout', { method: 'POST', body: {} }));
      if (get().state === 'logged_out') set({ errorCode: null });
    },
  };
});
