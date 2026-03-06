"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar, } from "./sidebar-provider";
import { MobileSidebarContent } from "./sidebar";
import { Breadcrumbs } from "./breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function Header() {
  const { state, isMobile, mobileOpen, setMobileOpen } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-background px-4 transition-[margin-left] duration-200",
          !isMobile && (collapsed ? "ml-16" : "ml-64")
        )}
      >
        {/* Mobile hamburger */}
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        )}

        <Breadcrumbs className="flex-1 min-w-0" />
      </header>

      {/* Mobile sidebar Sheet */}
      {isMobile && (
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 p-0 bg-sidebar-background">
            <SheetHeader className="border-b border-sidebar-border px-4 h-14 flex-row items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary">
                <span className="text-sm font-bold text-sidebar-primary-foreground">
                  N
                </span>
              </div>
              <SheetTitle className="text-sm font-semibold text-sidebar-primary-foreground">
                Notification API
              </SheetTitle>
            </SheetHeader>
            <MobileSidebarContent />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
