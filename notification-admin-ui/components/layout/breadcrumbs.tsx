"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

/** Map route segments to display labels */
const segmentLabels: Record<string, string> = {
  dashboard: "Dashboard",
  rules: "Rules",
  templates: "Templates",
  channels: "Channels",
  logs: "Notification Logs",
  "event-mappings": "Event Mappings",
  "bulk-upload": "Bulk Upload",
  "recipient-groups": "Recipient Groups",
  audit: "Audit Trail",
  settings: "Settings",
  new: "New",
  versions: "Versions",
  history: "History",
};

function formatSegment(segment: string): string {
  if (segmentLabels[segment]) return segmentLabels[segment];
  // If it looks like a UUID or ID, show abbreviated
  if (segment.length > 8 && /^[a-f0-9-]+$/i.test(segment)) {
    return segment.slice(0, 8) + "...";
  }
  // Fallback: capitalize and replace dashes
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();

  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-sm", className)}>
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <Home className="h-3.5 w-3.5" />
        <span className="sr-only">Home</span>
      </Link>

      {segments.map((segment, index) => {
        const href = "/" + segments.slice(0, index + 1).join("/");
        const isLast = index === segments.length - 1;
        const label = formatSegment(segment);

        return (
          <React.Fragment key={href}>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {isLast ? (
              <span className="font-medium text-foreground truncate max-w-[200px]">
                {label}
              </span>
            ) : (
              <Link
                href={href}
                className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[200px]"
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
