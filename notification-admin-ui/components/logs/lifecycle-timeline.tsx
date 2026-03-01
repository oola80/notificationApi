"use client";

import * as React from "react";
import {
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatRelativeTime } from "@/lib/formatters";
import type { TraceTimelineEntry } from "@/types";

// --- Status classification ---

const SUCCESS_EVENTS = new Set([
  "delivered",
  "sent",
  "completed",
  "rendered",
  "routed",
  "receipt_delivered",
]);

const FAILURE_EVENTS = new Set([
  "failed",
  "bounced",
  "error",
  "rejected",
  "receipt_failed",
  "receipt_bounced",
]);

function getNodeStatus(entry: TraceTimelineEntry): "success" | "failure" | "pending" {
  const eventLower = entry.eventType.toLowerCase();
  const statusLower = entry.status?.toLowerCase() ?? "";

  if (SUCCESS_EVENTS.has(eventLower) || SUCCESS_EVENTS.has(statusLower)) return "success";
  if (FAILURE_EVENTS.has(eventLower) || FAILURE_EVENTS.has(statusLower)) return "failure";
  return "pending";
}

const NODE_STYLES = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-green-600",
    lineClass: "bg-green-300",
    bgClass: "bg-green-50",
  },
  failure: {
    icon: XCircle,
    iconClass: "text-red-600",
    lineClass: "bg-red-300",
    bgClass: "bg-red-50",
  },
  pending: {
    icon: Clock,
    iconClass: "text-muted-foreground",
    lineClass: "bg-muted",
    bgClass: "bg-muted/30",
  },
};

// --- Metadata display ---

function MetadataPanel({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {Object.entries(metadata).map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="font-medium text-muted-foreground">{key}</dt>
          <dd className="truncate text-foreground">
            {typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// --- Timeline node ---

interface TimelineNodeProps {
  entry: TraceTimelineEntry;
  isLast: boolean;
}

function TimelineNode({ entry, isLast }: TimelineNodeProps) {
  const [expanded, setExpanded] = React.useState(false);
  const status = getNodeStatus(entry);
  const style = NODE_STYLES[status];
  const Icon = style.icon;
  const hasMetadata = entry.metadata && Object.keys(entry.metadata).length > 0;

  return (
    <div className="relative flex gap-3">
      {/* Vertical connector line */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-[11px] top-6 w-0.5",
            style.lineClass,
          )}
          style={{ bottom: "-8px" }}
        />
      )}

      {/* Icon */}
      <div className="relative z-10 mt-0.5 shrink-0">
        <Icon className={cn("h-6 w-6", style.iconClass)} />
      </div>

      {/* Content */}
      <div className={cn("mb-4 flex-1 rounded-md border p-3", style.bgClass)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{formatEventType(entry.eventType)}</span>
              {entry.source === "delivery_receipt" && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Receipt
                </span>
              )}
              {entry.provider && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {entry.provider}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {entry.actor}
              {entry.channel && <span> &middot; {entry.channel}</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-muted-foreground" title={entry.timestamp}>
              {formatRelativeTime(entry.timestamp)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {formatDate(entry.timestamp, "HH:mm:ss.SSS")}
            </div>
          </div>
        </div>

        {hasMetadata && (
          <>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Metadata
            </button>
            {expanded && <MetadataPanel metadata={entry.metadata!} />}
          </>
        )}
      </div>
    </div>
  );
}

// --- Helpers ---

function formatEventType(eventType: string): string {
  return eventType
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Main component ---

interface LifecycleTimelineProps {
  entries: TraceTimelineEntry[];
  className?: string;
}

function LifecycleTimeline({ entries, className }: LifecycleTimelineProps) {
  if (entries.length === 0) {
    return (
      <div className={cn("py-8 text-center text-sm text-muted-foreground", className)}>
        <Circle className="mx-auto mb-2 h-8 w-8" />
        No timeline events found.
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {entries.map((entry, idx) => (
        <TimelineNode
          key={entry.id}
          entry={entry}
          isLast={idx === entries.length - 1}
        />
      ))}
    </div>
  );
}

export { LifecycleTimeline };
export type { LifecycleTimelineProps };
