"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";

type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

const STATUS_COLORS: Record<HealthStatus, string> = {
  healthy: "bg-green-500",
  degraded: "bg-yellow-500",
  unhealthy: "bg-red-500",
  unknown: "bg-gray-400",
};

const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
  unknown: "Not configured",
};

interface HealthIndicatorProps {
  status: HealthStatus;
  label?: string;
  className?: string;
}

function HealthIndicator({ status, label, className }: HealthIndicatorProps) {
  const displayLabel = label ?? STATUS_LABELS[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex items-center gap-1.5", className)}>
            <span
              className={cn(
                "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
                STATUS_COLORS[status],
              )}
            />
            <span className="text-sm text-muted-foreground">{displayLabel}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{displayLabel}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function deriveHealthStatus(isActive: boolean, providerCount: number): HealthStatus {
  if (!isActive) return "unknown";
  if (providerCount === 0) return "unknown";
  return "healthy";
}

export { HealthIndicator, deriveHealthStatus };
export type { HealthIndicatorProps, HealthStatus };
