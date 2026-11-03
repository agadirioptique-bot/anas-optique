"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PaletteStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const usePalette = create<PaletteStore>((set) => ({ open: false, setOpen: (open) => set({ open }) }));

interface SidebarStore {
  collapsed: boolean;
  toggle: () => void;
}

/** Per-viewer convenience only; falls back to expanded when storage is unavailable. */
const safeLocalStorage = createJSONStorage(() => ({
  getItem: (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore (private mode, blocked storage)
    }
  },
  removeItem: (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
}));

export const useSidebar = create<SidebarStore>()(
  persist((set) => ({ collapsed: false, toggle: () => set((s) => ({ collapsed: !s.collapsed })) }), {
    name: "opticor:sidebar",
    storage: safeLocalStorage,
    skipHydration: true,
  }),
);
