import { create } from "zustand";
import type { Project } from "@/types";

interface AppStore {
  selectedProjectId: string | null;
  setSelectedProject: (id: string | null) => void;

  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  selectedProjectId: null,
  setSelectedProject: (id) => set({ selectedProjectId: id }),

  theme: "system",
  setTheme: (theme) => {
    set({ theme });
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      // system
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      root.classList.toggle("dark", prefersDark);
    }
  },

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
