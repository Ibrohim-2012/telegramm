'use client';
import { create } from 'zustand';

/** The hamburger lives in two places (search bar on phones, folder rail on desktop); both open the same drawer. */
export const useDrawer = create<{ open: boolean; setOpen: (o: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }));
