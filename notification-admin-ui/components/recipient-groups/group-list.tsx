"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Users, Pencil, Trash2 } from "lucide-react";
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
import {
  useRecipientGroups,
  useDeleteRecipientGroup,
} from "@/hooks/use-recipient-groups";
import { formatDate } from "@/lib/formatters";
import type { RecipientGroup } from "@/types";

function GroupList() {
  const router = useRouter();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = React.useState<RecipientGroup | null>(null);
  const [deleteId, setDeleteId] = React.useState("");
  const { trigger: doDelete, isMutating: isDeleting } = useDeleteRecipientGroup(deleteId);

  const { data, error, isLoading, mutate } = useRecipientGroups({
    page,
    limit: pageSize,
    isActive:
      statusFilter === "active"
        ? true
        : statusFilter === "inactive"
          ? false
          : undefined,
  });

  const groups = data?.data ?? [];

  const columns: ColumnDef<RecipientGroup>[] = [
    {
      id: "name",
      header: "Name",
      accessor: "name",
      sortable: false,
    },
    {
      id: "memberCount",
      header: "Members",
      render: (row) => String(row.members?.length ?? 0),
    },
    {
      id: "isActive",
      header: "Status",
      render: (row) => (
        <StatusBadge status={row.isActive ? "active" : "inactive"} />
      ),
    },
    {
      id: "createdAt",
      header: "Created",
      sortable: false,
      render: (row) => formatDate(row.createdAt),
    },
  ];

  const rowActions: RowAction<RecipientGroup>[] = [
    {
      label: "Edit",
      icon: <Pencil className="mr-2 h-4 w-4" />,
      onClick: (row) => router.push(`/recipient-groups/${row.id}`),
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
      toast.success("Recipient group deleted successfully");
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete recipient group",
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recipient Groups"
        description="Manage recipient groups for notification targeting"
        actions={
          <Button onClick={() => router.push("/recipient-groups/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Group
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
          placeholder="Search groups..."
          className="w-64"
        />

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
      </div>

      <DataTable<RecipientGroup>
        columns={columns}
        data={groups}
        rowKey={(row) => row.id}
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        loading={isLoading}
        error={error?.message}
        onRetry={() => mutate()}
        emptyTitle="No recipient groups found"
        emptyDescription="Create your first recipient group to get started"
        emptyIcon={<Users className="h-10 w-10 text-muted-foreground" />}
        emptyAction={
          <Button onClick={() => router.push("/recipient-groups/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Group
          </Button>
        }
        onRowClick={(row) => router.push(`/recipient-groups/${row.id}`)}
        rowActions={rowActions}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Recipient Group"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This may affect rules referencing this group.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        loading={isDeleting}
      />
    </div>
  );
}

export { GroupList };
