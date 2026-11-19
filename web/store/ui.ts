'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { translate, type Key, type Lang } from '@/lib/i18n';

export type Theme = 'light' | 'dark' | 'system';
export const WALLPAPERS = ['classic', 'sky', 'mint', 'sunset', 'violet', 'plain', 'aurora', 'galaxy', 'gold'] as const;
/** Only available while Premium (of this app) is active. */
export const PREMIUM_WALLPAPERS: readonly string[] = ['aurora', 'galaxy', 'gold'];
export type Wallpaper = (typeof WALLPAPERS)[number];

interface UiState {
  theme: Theme;
  lang: Lang;
  fontSize: number;
  wallpaper: Wallpaper;
  setWallpaper: (w: Wallpaper) => void;
  notify: boolean;
  sound: boolean;
  notifyPreview: boolean;
  setPrefs: (p: Partial<Pick<UiState, 'notify' | 'sound' | 'notifyPreview'>>) => void;
  setTheme: (t: Theme) => void;
  setLang: (l: Lang) => void;
  setFontSize: (n: number) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      lang: 'uz',
      fontSize: 16,
      wallpaper: 'classic',
      setWallpaper: (wallpaper) => set({ wallpaper }),
      notify: false,
      sound: true,
      notifyPreview: true,
      setPrefs: (p) => set(p),
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      setFontSize: (fontSize) => set({ fontSize }),
    }),
    { name: 'mt-ui', skipHydration: true },
  ),
);

export function useT() {
  const lang = useUi((s) => s.lang);
  return (key: Key) => translate(lang, key);
}

let themeFadeTimer: ReturnType<typeof setTimeout> | undefined;

export function applyTheme(theme: Theme, fontSize: number, wallpaper: Wallpaper = 'classic') {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  if (root.classList.contains('dark') !== dark) {
    // 200ms colour cross-fade on a real theme switch (not on first paint)
    root.classList.add('theme-fade');
    clearTimeout(themeFadeTimer);
    themeFadeTimer = setTimeout(() => root.classList.remove('theme-fade'), 260);
  }
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.fontSize = `${fontSize}px`;
  document.documentElement.dataset.wp = wallpaper;
}
