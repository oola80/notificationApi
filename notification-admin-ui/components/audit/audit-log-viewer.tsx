"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Skeleton,
  Button,
  Badge,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { Pagination, SearchInput, DateRangePicker, PageHeader } from "@/components/shared";
import type { DateRange } from "@/components/shared";
import { AuditDetailRow } from "./audit-detail-row";
import { CsvExportButton } from "./csv-export";
import { useAuditLogs, useAuditSearch } from "@/hooks/use-audit";
import { formatDate, truncate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { AuditEvent, AuditSearchParams } from "@/types";

const DEFAULT_PAGE_SIZE = parseInt(
  process.env.NEXT_PUBLIC_DEFAULT_PAGE_SIZE ?? "50",
  10,
);

function AuditLogViewer() {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [eventType, setEventType] = React.useState("");
  const [actor, setActor] = React.useState("");
  const [dateRange, setDateRange] = React.useState<DateRange>({ from: "", to: "" });
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const isSearchMode = searchQuery.length >= 2;

  const filterParams: AuditSearchParams = {
    eventType: eventType || undefined,
    actor: actor || undefined,
    from: dateRange.from || undefined,
    to: dateRange.to || undefined,
    page,
    pageSize,
  };

  const logsResult = useAuditLogs(isSearchMode ? undefined : filterParams);
  const searchResult = useAuditSearch(
    searchQuery,
    isSearchMode
      ? { from: dateRange.from || undefined, to: dateRange.to || undefined, page, pageSize }
      : undefined,
  );

  const activeResult = isSearchMode ? searchResult : logsResult;
  const data = activeResult.data?.data ?? [];
  const meta = activeResult.data?.meta;
  const isLoading = activeResult.isLoading;
  const error = activeResult.error;

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const handleEventTypeChange = (value: string) => {
    setEventType(value === "all" ? "" : value);
    setPage(1);
  };

  const handleDateChange = (range: DateRange) => {
    setDateRange(range);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setEventType("");
    setActor("");
    setDateRange({ from: "", to: "" });
    setPage(1);
  };

  const hasActiveFilters = searchQuery || eventType || actor || dateRange.from || dateRange.to;

  const csvParams: AuditSearchParams = {
    ...filterParams,
    q: isSearchMode ? searchQuery : undefined,
    page: undefined,
    pageSize: undefined,
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Full-text search..."
          className="w-64"
        />
        <div className="w-48">
          <Select value={eventType || "all"} onValueChange={handleEventTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All event types</SelectItem>
              <SelectItem value="event.ingested">event.ingested</SelectItem>
              <SelectItem value="event.normalized">event.normalized</SelectItem>
              <SelectItem value="notification.created">notification.created</SelectItem>
              <SelectItem value="notification.queued">notification.queued</SelectItem>
              <SelectItem value="delivery.sent">delivery.sent</SelectItem>
              <SelectItem value="delivery.delivered">delivery.delivered</SelectItem>
              <SelectItem value="delivery.failed">delivery.failed</SelectItem>
              <SelectItem value="delivery.bounced">delivery.bounced</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          placeholder="Actor..."
          value={actor}
          onChange={(e) => { setActor(e.target.value); setPage(1); }}
          className="w-36"
        />
        <DateRangePicker value={dateRange} onChange={handleDateChange} />
        <div className="flex gap-2 ml-auto">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          <CsvExportButton params={csvParams} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => activeResult.mutate()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && !isLoading && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <span>Failed to load audit logs: {error.message}</span>
          <Button variant="outline" size="sm" onClick={() => activeResult.mutate()}>
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Timestamp</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Notification ID</TableHead>
              <TableHead>Correlation ID</TableHead>
              <TableHead className="hidden lg:table-cell">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: pageSize > 10 ? 10 : pageSize }, (_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {Array.from({ length: 7 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : data.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No audit log entries found.
                    </TableCell>
                  </TableRow>
                )
                : data.map((event: AuditEvent) => (
                    <React.Fragment key={event.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleRow(event.id)}
                      >
                        <TableCell className="w-10">
                          {expandedRows.has(event.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(event.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {event.eventType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{event.actor}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {event.notificationId
                            ? truncate(event.notificationId, 12)
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {event.correlationId
                            ? truncate(event.correlationId, 12)
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {event.metadata && (event.metadata as Record<string, unknown>).status
                            ? (
                              <Badge variant="secondary" className="text-xs">
                                {String((event.metadata as Record<string, unknown>).status)}
                              </Badge>
                            )
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(event.id) && (
                        <TableRow>
                          <TableCell colSpan={7} className="p-0">
                            <AuditDetailRow event={event} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {meta && meta.totalCount > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={meta.totalCount}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      )}
    </div>
  );
}

export { AuditLogViewer };
