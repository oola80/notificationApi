"use client";

import * as React from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Skeleton,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui";
import { Pagination } from "./pagination";
import { EmptyState } from "./empty-state";
import { cn } from "@/lib/utils";
import type { SortOrder } from "@/types/api";

// --- Column definition ---

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessor?: keyof T | ((row: T) => unknown);
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

// --- Row action ---

export interface RowAction<T> {
  label: string;
  onClick: (row: T) => void;
  icon?: React.ReactNode;
  destructive?: boolean;
  separator?: boolean;
}

// --- Props ---

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Unique key extractor per row */
  rowKey: (row: T) => string | number;

  // Pagination
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;

  // Sorting
  sortBy?: string;
  sortOrder?: SortOrder;
  onSort?: (columnId: string, order: SortOrder) => void;

  // States
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;

  // Interactions
  onRowClick?: (row: T) => void;
  rowActions?: RowAction<T>[];

  className?: string;
}

function getCellValue<T>(row: T, accessor: ColumnDef<T>["accessor"]): unknown {
  if (!accessor) return null;
  if (typeof accessor === "function") return accessor(row);
  return row[accessor];
}

function DataTable<T>({
  columns,
  data,
  rowKey,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortOrder,
  onSort,
  loading = false,
  error,
  onRetry,
  emptyTitle = "No results found",
  emptyDescription,
  emptyIcon,
  emptyAction,
  onRowClick,
  rowActions,
  className,
}: DataTableProps<T>) {
  const hasActions = rowActions && rowActions.length > 0;
  const colCount = columns.length + (hasActions ? 1 : 0);

  const handleSort = (columnId: string) => {
    if (!onSort) return;
    const nextOrder: SortOrder =
      sortBy === columnId && sortOrder === "ASC" ? "DESC" : "ASC";
    onSort(columnId, nextOrder);
  };

  const renderSortIcon = (columnId: string) => {
    if (sortBy !== columnId) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    }
    return sortOrder === "ASC" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  // --- Error state ---
  if (error && !loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div>
          <p className="font-medium">Something went wrong</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  // --- Empty state (non-loading) ---
  if (!loading && data.length === 0) {
    return (
      <div className={className}>
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  className={cn(
                    col.sortable && onSort && "cursor-pointer select-none",
                    col.className,
                  )}
                  onClick={
                    col.sortable && onSort
                      ? () => handleSort(col.id)
                      : undefined
                  }
                >
                  <span className="inline-flex items-center">
                    {col.header}
                    {col.sortable && onSort && renderSortIcon(col.id)}
                  </span>
                </TableHead>
              ))}
              {hasActions && (
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: pageSize }, (_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {Array.from({ length: colCount }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : data.map((row) => (
                  <TableRow
                    key={rowKey(row)}
                    className={cn(onRowClick && "cursor-pointer")}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => (
                      <TableCell key={col.id} className={col.className}>
                        {col.render
                          ? col.render(row)
                          : String(getCellValue(row, col.accessor) ?? "")}
                      </TableCell>
                    ))}
                    {hasActions && (
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        className="w-12"
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Row actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {rowActions!.map((action, idx) => (
                              <React.Fragment key={action.label}>
                                {action.separator && idx > 0 && (
                                  <DropdownMenuSeparator />
                                )}
                                <DropdownMenuItem
                                  onClick={() => action.onClick(row)}
                                  className={cn(
                                    action.destructive && "text-destructive",
                                  )}
                                >
                                  {action.icon}
                                  {action.label}
                                </DropdownMenuItem>
                              </React.Fragment>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}

export { DataTable };
