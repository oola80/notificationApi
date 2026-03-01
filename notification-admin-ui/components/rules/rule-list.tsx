"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Scale, Pencil, Copy, Trash2 } from "lucide-react";
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
  ChannelIcon,
  type ColumnDef,
  type RowAction,
} from "@/components/shared";
import { useRules, useDeleteRule, useCreateRule } from "@/hooks/use-rules";
import { formatDate } from "@/lib/formatters";
import type { Rule, ChannelType } from "@/types";

function RuleList() {
  const router = useRouter();

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [search, setSearch] = React.useState("");
  const [eventTypeFilter, setEventTypeFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [channelFilter, setChannelFilter] = React.useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = React.useState<Rule | null>(null);
  const [deleteId, setDeleteId] = React.useState("");
  const { trigger: doDelete, isMutating: isDeleting } = useDeleteRule(deleteId);

  // Duplicate
  const { trigger: doCreate, isMutating: isDuplicating } = useCreateRule();

  const { data, error, isLoading, mutate } = useRules({
    page,
    limit: pageSize,
    eventType: eventTypeFilter || undefined,
    isActive:
      statusFilter === "active"
        ? true
        : statusFilter === "inactive"
          ? false
          : undefined,
  });

  const rules = data?.data ?? [];

  // Filter client-side by search and channel (backend doesn't support these filters)
  const filteredRules = React.useMemo(() => {
    let result = rules;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.eventType.toLowerCase().includes(q),
      );
    }
    if (channelFilter) {
      result = result.filter((r) =>
        r.actions.some((a) => a.channels.includes(channelFilter as ChannelType)),
      );
    }
    return result;
  }, [rules, search, channelFilter]);

  // Extract unique event types for filter dropdown
  const eventTypes = React.useMemo(() => {
    const set = new Set(rules.map((r) => r.eventType));
    return Array.from(set).sort();
  }, [rules]);

  const columns: ColumnDef<Rule>[] = [
    {
      id: "name",
      header: "Name",
      accessor: "name",
      sortable: false,
    },
    {
      id: "eventType",
      header: "Event Type",
      accessor: "eventType",
      sortable: false,
    },
    {
      id: "channels",
      header: "Channels",
      render: (row) => {
        const channels = new Set<string>();
        row.actions.forEach((a) => a.channels.forEach((c) => channels.add(c)));
        return (
          <div className="flex items-center gap-1.5">
            {Array.from(channels).map((ch) => (
              <ChannelIcon key={ch} channel={ch} className="text-muted-foreground" />
            ))}
          </div>
        );
      },
    },
    {
      id: "priority",
      header: "Priority",
      render: (row) => String(row.priority),
    },
    {
      id: "isExclusive",
      header: "Exclusive",
      render: (row) =>
        row.isExclusive ? (
          <StatusBadge status="active">Yes</StatusBadge>
        ) : (
          <span className="text-muted-foreground">No</span>
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
      id: "createdAt",
      header: "Created",
      sortable: false,
      render: (row) => formatDate(row.createdAt),
    },
  ];

  const handleDuplicate = async (rule: Rule) => {
    try {
      const dto = {
        name: `${rule.name} (Copy)`,
        eventType: rule.eventType,
        actions: rule.actions,
        conditions: rule.conditions ?? undefined,
        suppression: rule.suppression ?? undefined,
        deliveryPriority: rule.deliveryPriority ?? undefined,
        priority: rule.priority,
        isExclusive: rule.isExclusive,
      };
      const result = await doCreate(dto);
      toast.success("Rule duplicated successfully");
      router.push(`/rules/${result.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to duplicate rule",
      );
    }
  };

  const rowActions: RowAction<Rule>[] = [
    {
      label: "Edit",
      icon: <Pencil className="mr-2 h-4 w-4" />,
      onClick: (row) => router.push(`/rules/${row.id}`),
    },
    {
      label: "Duplicate",
      icon: <Copy className="mr-2 h-4 w-4" />,
      onClick: (row) => handleDuplicate(row),
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
      toast.success("Rule deleted successfully");
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete rule",
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Rules"
        description="Manage notification rules that determine how events trigger notifications"
        actions={
          <Button onClick={() => router.push("/rules/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Rule
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
          placeholder="Search rules..."
          className="w-64"
        />

        <Select
          value={eventTypeFilter}
          onValueChange={(val) => {
            setEventTypeFilter(val === "all" ? "" : val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Event Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Event Types</SelectItem>
            {eventTypes.map((et) => (
              <SelectItem key={et} value={et}>
                {et}
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
          value={channelFilter}
          onValueChange={(val) => {
            setChannelFilter(val === "all" ? "" : val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="push">Push</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable<Rule>
        columns={columns}
        data={filteredRules}
        rowKey={(row) => row.id}
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        loading={isLoading}
        error={error?.message}
        onRetry={() => mutate()}
        emptyTitle="No rules found"
        emptyDescription="Create your first notification rule to get started"
        emptyIcon={<Scale className="h-10 w-10 text-muted-foreground" />}
        emptyAction={
          <Button onClick={() => router.push("/rules/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Rule
          </Button>
        }
        onRowClick={(row) => router.push(`/rules/${row.id}`)}
        rowActions={rowActions}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Rule"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This will deactivate the rule.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        loading={isDeleting}
      />
    </div>
  );
}

export { RuleList };
