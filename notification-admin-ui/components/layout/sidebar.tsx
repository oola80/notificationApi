"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitBranch,
  FileText,
  Radio,
  ScrollText,
  ArrowLeftRight,
  Upload,
  Users,
  Shield,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Rules", href: "/rules", icon: GitBranch },
  { label: "Templates", href: "/templates", icon: FileText },
  { label: "Channels", href: "/channels", icon: Radio },
  { label: "Notification Logs", href: "/logs", icon: ScrollText },
  { label: "Event Mappings", href: "/event-mappings", icon: ArrowLeftRight },
  { label: "Bulk Upload", href: "/bulk-upload", icon: Upload },
  { label: "Recipient Groups", href: "/recipient-groups", icon: Users },
  { label: "Audit Trail", href: "/audit", icon: Shield },
  { label: "Settings", href: "/settings", icon: Settings },
];

function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

export function Sidebar() {
  const pathname = usePathname();
  const { state, toggle, isMobile } = useSidebar();
  const collapsed = state === "collapsed";

  // Don't render the fixed sidebar on mobile — the Sheet handles it
  if (isMobile) return null;

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-sidebar-border bg-sidebar-background transition-[width] duration-200",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo / App Name */}
        <div
          className={cn(
            "flex h-14 items-center border-b border-sidebar-border px-4",
            collapsed ? "justify-center" : "gap-2"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary">
            <span className="text-sm font-bold text-sidebar-primary-foreground">
              N
            </span>
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold text-sidebar-primary-foreground">
              Notification API
            </span>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-2 py-2">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  pathname.startsWith(item.href + "/"));
              return (
                <NavLink
                  key={item.href}
                  item={item}
                  isActive={isActive}
                  collapsed={collapsed}
                />
              );
            })}
          </nav>
        </ScrollArea>

        <Separator />

        {/* Collapse Toggle */}
        <div className={cn("flex items-center p-2", collapsed ? "justify-center" : "justify-end")}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
            <span className="sr-only">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </span>
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}

/** Mobile sidebar content — rendered inside a Sheet */
export function MobileSidebarContent() {
  const pathname = usePathname();
  const { setMobileOpen } = useSidebar();

  return (
    <nav className="flex flex-col gap-1 px-2 py-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" &&
            pathname.startsWith(item.href + "/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
