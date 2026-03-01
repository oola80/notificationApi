"use client";

import { cn } from "@/lib/utils";
import type { UploadStatus } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-blue-500",
  processing: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  partial: "bg-orange-500",
  cancelled: "bg-gray-400",
};

interface ProgressBarProps {
  percentage: number;
  status: UploadStatus;
  className?: string;
  showLabel?: boolean;
}

function ProgressBar({
  percentage,
  status,
  className,
  showLabel = true,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percentage));
  const colorClass = STATUS_COLORS[status] ?? "bg-blue-500";
  const isAnimating = status === "processing" || status === "queued";

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center gap-3">
        <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              colorClass,
              isAnimating && "animate-pulse",
            )}
            style={{ width: `${clamped}%` }}
          />
        </div>
        {showLabel && (
          <span className="min-w-[3rem] text-right text-sm font-medium tabular-nums">
            {Math.round(clamped)}%
          </span>
        )}
      </div>
    </div>
  );
}

export { ProgressBar };
export type { ProgressBarProps };
