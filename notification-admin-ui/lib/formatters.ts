import { format, formatDistanceToNow, parseISO } from "date-fns";

export function formatDate(
  date: string | Date,
  dateFormat = "MMM d, yyyy HH:mm",
): string {
  const parsed = typeof date === "string" ? parseISO(date) : date;
  return format(parsed, dateFormat);
}

export function formatRelativeTime(date: string | Date): string {
  const parsed = typeof date === "string" ? parseISO(date) : date;
  return formatDistanceToNow(parsed, { addSuffix: true });
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercentage(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n / 100);
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
  bounced: "Bounced",
  suppressed: "Suppressed",
  retrying: "Retrying",
  cancelled: "Cancelled",
  active: "Active",
  inactive: "Inactive",
  draft: "Draft",
  completed: "Completed",
  partial: "Partial",
  validating: "Validating",
};

export function formatStatus(status: string): string {
  return STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "\u2026";
}
