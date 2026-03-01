"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  X,
} from "lucide-react";
import {
  Button,
  Badge,
  Card,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Skeleton,
} from "@/components/ui";
import {
  PageHeader,
  SearchInput,
  StatusBadge,
  DateRangePicker,
  Pagination,
  EmptyState,
  ChannelIcon,
} from "@/components/shared";
import type { DateRange } from "@/components/shared";
import { LifecycleTimeline } from "./lifecycle-timeline";
import { useNotificationLogs, useNotificationSearch, useNotificationTrace } from "@/hooks/use-notifications";
import { formatDate, truncate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { AuditEvent } from "@/types";

// --- Filter chips ---

const STATUS_OPTIONS = [
  "pending",
  "processing",
  "sent",
  "delivered",
  "failed",
  "bounced",
  "suppressed",
  "retrying",
];

const CHANNEL_OPTIONS = ["email", "sms", "whatsapp", "push"];

// --- Multi-select filter button ---

interface FilterChipGroupProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}

function FilterChipGroup({ label, options, selected, onToggle, onClear }: FilterChipGroupProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      {options.map((opt) => {
        const isActive = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            {opt.charAt(0).toUpperCase() + opt.slice(1)}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// --- Expandable row with inline trace ---

function ExpandableTraceRow({ notificationId }: { notificationId: string }) {
  const { data: trace, isLoading } = useNotificationTrace(notificationId);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No trace data available for this notification.
      </div>
    );
  }

  const { summary, timeline } = trace;

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap gap-4 text-xs">
        {summary.channel && (
          <span className="flex items-center gap-1">
            <ChannelIcon channel={summary.channel} size={12} />
            <span className="capitalize">{summary.channel}</span>
          </span>
        )}
        {summary.finalStatus && <StatusBadge status={summary.finalStatus} />}
        <span className="text-muted-foreground">
          {summary.eventCount} events &middot; {summary.receiptCount} receipts
        </span>
      </div>
      {/* Show a compact version: last 5 timeline entries */}
      <LifecycleTimeline
        entries={timeline.slice(0, 5)}
      />
      {timeline.length > 5 && (
        <p className="text-xs text-muted-foreground">
          + {timeline.length - 5} more events. View full detail for complete timeline.
        </p>
      )}
    </div>
  );
}

// --- Main component ---

function LogList() {
  const router = useRouter();

  // Pagination state
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);

  // Filter state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [eventTypeFilter, setEventTypeFilter] = React.useState("");
  const [statusFilters, setStatusFilters] = React.useState<string[]>([]);
  const [channelFilters, setChannelFilters] = React.useState<string[]>([]);
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>();

  // Expanded rows
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  // Determine search mode: full-text search vs filtered logs
  const isSearchMode = searchQuery.length >= 2;

  // Build query params for the logs endpoint
  const logParams = React.useMemo(
    () => ({
      eventType: eventTypeFilter || undefined,
      from: dateRange?.from,
      to: dateRange?.to,
      q: !isSearchMode ? undefined : undefined, // handled by search hook
      page,
      pageSize,
    }),
    [eventTypeFilter, dateRange, page, pageSize, isSearchMode],
  );

  // Fetch data (logs endpoint for browsing, search endpoint for full-text)
  const {
    data: logsData,
    isLoading: logsLoading,
    error: logsError,
    mutate: refreshLogs,
  } = useNotificationLogs(isSearchMode ? undefined : logParams);

  const {
    data: searchData,
    isLoading: searchLoading,
  } = useNotificationSearch(
    isSearchMode ? searchQuery : "",
    isSearchMode
      ? { from: dateRange?.from, to: dateRange?.to, page, pageSize }
      : undefined,
  );

  // Select active data source
  const activeData = isSearchMode ? searchData : logsData;
  const isLoading = isSearchMode ? searchLoading : logsLoading;

  const events = React.useMemo(() => activeData?.data ?? [], [activeData]);
  const totalCount = activeData?.meta?.totalCount ?? 0;

  // Client-side filtering for status and channel (applied on top of API results)
  const filteredEvents = React.useMemo(() => {
    let filtered = events;
    if (statusFilters.length > 0) {
      filtered = filtered.filter((e) => {
        const eventStatus = extractStatus(e);
        return eventStatus ? statusFilters.includes(eventStatus.toLowerCase()) : false;
      });
    }
    if (channelFilters.length > 0) {
      filtered = filtered.filter((e) => {
        const channel = extractChannel(e);
        return channel ? channelFilters.includes(channel.toLowerCase()) : false;
      });
    }
    return filtered;
  }, [events, statusFilters, channelFilters]);

  // Toggle expanded row
  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle filter chip
  const toggleStatus = (s: string) => {
    setStatusFilters((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
    setPage(1);
  };
  const toggleChannel = (c: string) => {
    setChannelFilters((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
    setPage(1);
  };

  // Handle search change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  // Handle date range change
  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
    setPage(1);
  };

  // Handle page size change
  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  // Clear all filters
  const hasActiveFilters =
    searchQuery || eventTypeFilter || statusFilters.length > 0 || channelFilters.length > 0 || dateRange;

  const clearAllFilters = () => {
    setSearchQuery("");
    setEventTypeFilter("");
    setStatusFilters([]);
    setChannelFilters([]);
    setDateRange(undefined);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Logs"
        description="Search and filter notification logs with expandable detail rows."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshLogs?.()}
            disabled={isLoading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Search + date range row */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Full-text search across notifications..."
              className="flex-1"
            />
            <DateRangePicker
              value={dateRange}
              onChange={handleDateRangeChange}
            />
          </div>

          {/* Event type filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Event Type:</span>
              <input
                type="text"
                value={eventTypeFilter}
                onChange={(e) => {
                  setEventTypeFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="e.g. order.created"
                className="h-8 w-48 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Chip filters */}
          <div className="flex flex-col gap-2">
            <FilterChipGroup
              label="Status"
              options={STATUS_OPTIONS}
              selected={statusFilters}
              onToggle={toggleStatus}
              onClear={() => { setStatusFilters([]); setPage(1); }}
            />
            <FilterChipGroup
              label="Channel"
              options={CHANNEL_OPTIONS}
              selected={channelFilters}
              onToggle={toggleChannel}
              onClear={() => { setChannelFilters([]); setPage(1); }}
            />
          </div>

          {/* Active filters summary */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {isSearchMode ? "Search results" : `${totalCount} results`}
                {(statusFilters.length > 0 || channelFilters.length > 0) &&
                  ` (${filteredEvents.length} after client filters)`}
              </span>
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                Clear all filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error state */}
      {logsError && !isLoading && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <p className="font-medium">Failed to load logs</p>
          <p className="text-sm text-muted-foreground">{logsError.message}</p>
          <Button variant="outline" size="sm" onClick={() => refreshLogs?.()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      {!logsError && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Notification ID</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: pageSize > 10 ? 10 : pageSize }, (_, i) => (
                    <TableRow key={`skel-${i}`}>
                      {Array.from({ length: 8 }, (_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : filteredEvents.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <EmptyState
                          icon={<FileText className="h-12 w-12" />}
                          title="No logs found"
                          description={
                            hasActiveFilters
                              ? "Try adjusting your filters or search query."
                              : "No notification logs have been recorded yet."
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )
                  : filteredEvents.map((event) => {
                      const isExpanded = event.notificationId
                        ? expandedRows.has(event.notificationId)
                        : false;
                      const channel = extractChannel(event);
                      const status = extractStatus(event);

                      return (
                        <React.Fragment key={event.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() =>
                              event.notificationId && toggleRow(event.notificationId)
                            }
                          >
                            <TableCell>
                              {event.notificationId && (
                                isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {event.notificationId
                                ? truncate(event.notificationId, 12)
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs">
                                {event.eventType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {channel ? (
                                <span className="flex items-center gap-1.5 capitalize">
                                  <ChannelIcon channel={channel} size={14} />
                                  {channel}
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>
                              {status ? <StatusBadge status={status} /> : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {event.actor}
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatDate(event.createdAt)}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {event.notificationId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    router.push(`/logs/${event.notificationId}`)
                                  }
                                  title="View Detail"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>

                          {/* Expanded row */}
                          {isExpanded && event.notificationId && (
                            <TableRow>
                              <TableCell colSpan={8} className="bg-muted/30 p-0">
                                <ExpandableTraceRow
                                  notificationId={event.notificationId}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalCount > 0 && !isLoading && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={
            statusFilters.length > 0 || channelFilters.length > 0
              ? filteredEvents.length
              : totalCount
          }
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );
}

// --- Helpers to extract channel/status from audit event metadata ---

function extractChannel(event: AuditEvent): string | null {
  if (event.metadata?.channel) return String(event.metadata.channel);
  if (event.payloadSnapshot?.channel) return String(event.payloadSnapshot.channel);
  return null;
}

function extractStatus(event: AuditEvent): string | null {
  if (event.metadata?.status) return String(event.metadata.status);
  if (event.payloadSnapshot?.status) return String(event.payloadSnapshot.status);
  // Infer from event type
  const lower = event.eventType.toLowerCase();
  if (lower.includes("delivered")) return "delivered";
  if (lower.includes("sent")) return "sent";
  if (lower.includes("failed")) return "failed";
  if (lower.includes("bounced")) return "bounced";
  if (lower.includes("pending")) return "pending";
  if (lower.includes("processing")) return "processing";
  return null;
}

export { LogList };
