"use client";

import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <>
      <Sidebar />
      <Header />
      <main
        className={cn(
          "min-h-[calc(100vh-3.5rem)] p-6 transition-[margin-left] duration-200",
          !isMobile && (collapsed ? "ml-16" : "ml-64")
        )}
      >
        {children}
      </main>
    </>
  );
}
