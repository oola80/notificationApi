"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ArrowRightLeft, Pencil, FlaskConical, Trash2 } from "lucide-react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import {
  DataTable,
  PageHeader,
  SearchInput,
  StatusBadge,
  ConfirmDialog,
  type ColumnDef,
  type RowAction,
} from "@/components/shared";
import { useMappings, useDeleteMapping } from "@/hooks/use-mappings";
import { formatDate } from "@/lib/formatters";
import type { EventMapping, SortOrder } from "@/types";

function MappingList() {
  const router = useRouter();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [search, setSearch] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [priorityFilter, setPriorityFilter] = React.useState("");
  const [sortBy, setSortBy] = React.useState("createdAt");
  const [sortOrder, setSortOrder] = React.useState<SortOrder>("DESC");

  // Delete state
  const [deleteTarget, setDeleteTarget] = React.useState<EventMapping | null>(null);
  const [deleteId, setDeleteId] = React.useState("");
  const { trigger: doDelete, isMutating: isDeleting } = useDeleteMapping(deleteId);

  const { data, error, isLoading, mutate } = useMappings({
    page,
    limit: pageSize,
    sourceId: sourceFilter || undefined,
    isActive:
      statusFilter === "active"
        ? true
        : statusFilter === "inactive"
          ? false
          : undefined,
  });

  const mappings = data?.data ?? [];

  // Extract unique source IDs for filter dropdown
  const sourceIds = React.useMemo(() => {
    const set = new Set(mappings.map((m) => m.sourceId));
    return Array.from(set).sort();
  }, [mappings]);

  const columns: ColumnDef<EventMapping>[] = [
    {
      id: "name",
      header: "Name",
      accessor: "name",
      sortable: true,
    },
    {
      id: "sourceId",
      header: "Source System",
      accessor: "sourceId",
      sortable: true,
    },
    {
      id: "eventType",
      header: "Event Type",
      accessor: "eventType",
      sortable: true,
    },
    {
      id: "priority",
      header: "Priority",
      render: (row) => (
        <StatusBadge status={row.priority === "critical" ? "error" : "active"}>
          {row.priority}
        </StatusBadge>
      ),
    },
    {
      id: "isActive",
      header: "Status",
      render: (row) => (
        <StatusBadge status={row.isActive ? "active" : "inactive"} />
      ),
    },
    {
      id: "fieldCount",
      header: "Fields",
      render: (row) => {
        const count = row.fieldMappings
          ? Object.keys(row.fieldMappings).length
          : 0;
        return String(count);
      },
    },
    {
      id: "createdAt",
      header: "Created",
      sortable: true,
      render: (row) => formatDate(row.createdAt),
    },
  ];

  const rowActions: RowAction<EventMapping>[] = [
    {
      label: "Edit",
      icon: <Pencil className="mr-2 h-4 w-4" />,
      onClick: (row) => router.push(`/event-mappings/${row.id}`),
    },
    {
      label: "Test",
      icon: <FlaskConical className="mr-2 h-4 w-4" />,
      onClick: (row) => router.push(`/event-mappings/${row.id}?tab=test`),
    },
    {
      label: "Delete",
      icon: <Trash2 className="mr-2 h-4 w-4" />,
      onClick: (row) => {
        setDeleteId(row.id);
        setDeleteTarget(row);
      },
      destructive: true,
      separator: true,
    },
  ];

  const handleDelete = async () => {
    try {
      await doDelete();
      toast.success("Mapping deleted successfully");
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete mapping",
      );
    }
  };

  const handleSort = (columnId: string, order: SortOrder) => {
    setSortBy(columnId);
    setSortOrder(order);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Event Mappings"
        description="Manage runtime event mapping configurations for source system integration"
        actions={
          <Button onClick={() => router.push("/event-mappings/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Mapping
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          placeholder="Search mappings..."
          className="w-64"
        />

        <Select
          value={sourceFilter}
          onValueChange={(val) => {
            setSourceFilter(val === "all" ? "" : val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sourceIds.map((sid) => (
              <SelectItem key={sid} value={sid}>
                {sid}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(val) => {
            setStatusFilter(val === "all" ? "" : val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={priorityFilter}
          onValueChange={(val) => {
            setPriorityFilter(val === "all" ? "" : val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable<EventMapping>
        columns={columns}
        data={mappings}
        rowKey={(row) => row.id}
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        loading={isLoading}
        error={error?.message}
        onRetry={() => mutate()}
        emptyTitle="No mappings found"
        emptyDescription="Create your first event mapping to get started"
        emptyIcon={<ArrowRightLeft className="h-10 w-10 text-muted-foreground" />}
        emptyAction={
          <Button onClick={() => router.push("/event-mappings/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Mapping
          </Button>
        }
        onRowClick={(row) => router.push(`/event-mappings/${row.id}`)}
        rowActions={rowActions}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Mapping"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        loading={isDeleting}
      />
    </div>
  );
}

export { MappingList };
