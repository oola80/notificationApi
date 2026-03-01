import { Badge } from "@/components/ui";
import type { BadgeProps } from "@/components/ui";

type StatusVariant = BadgeProps["variant"];

const STATUS_MAP: Record<string, StatusVariant> = {
  active: "success",
  success: "success",
  delivered: "success",
  completed: "success",
  sent: "success",
  queued: "warning",
  pending: "warning",
  processing: "warning",
  retrying: "warning",
  validating: "warning",
  failed: "destructive",
  error: "destructive",
  bounced: "destructive",
  inactive: "secondary",
  draft: "secondary",
  cancelled: "secondary",
  suppressed: "secondary",
  discarded: "secondary",
  partial: "outline",
  investigated: "outline",
  reprocessed: "success",
};

function formatLabel(status: string): string {
  return status
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  status: string;
}

function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const variant = STATUS_MAP[status.toLowerCase()] ?? "default";
  return (
    <Badge variant={variant} className={className} {...props}>
      {formatLabel(status)}
    </Badge>
  );
}

export { StatusBadge };
export type { StatusBadgeProps };
