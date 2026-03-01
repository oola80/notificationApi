"use client";

import * as React from "react";

type SidebarState = "expanded" | "collapsed";

interface SidebarContextValue {
  state: SidebarState;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  isMobile: boolean;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContextValue | undefined>(
  undefined
);

const SIDEBAR_STORAGE_KEY = "notification-admin-sidebar-state";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1279px)");

  const [open, setOpenState] = React.useState(true);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Load persisted state on mount
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored === "collapsed") {
        setOpenState(false);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Auto-collapse on tablet
  React.useEffect(() => {
    if (isTablet) {
      setOpenState(false);
    }
  }, [isTablet]);

  const setOpen = React.useCallback((value: boolean) => {
    setOpenState(value);
    try {
      localStorage.setItem(
        SIDEBAR_STORAGE_KEY,
        value ? "expanded" : "collapsed"
      );
    } catch {
      // localStorage unavailable
    }
  }, []);

  const toggle = React.useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const state: SidebarState = open ? "expanded" : "collapsed";

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      state,
      open,
      setOpen,
      toggle,
      isMobile,
      mobileOpen,
      setMobileOpen,
    }),
    [state, open, setOpen, toggle, isMobile, mobileOpen]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
