"use client";

import * as React from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import {
  Button,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import {
  DataTable,
  StatusBadge,
  ConfirmDialog,
  Pagination,
} from "@/components/shared";
import type { ColumnDef, RowAction } from "@/components/shared";
import { useDlqEntries, useUpdateDlqStatus, useReprocessDlq } from "@/hooks/use-audit";
import { formatDate } from "@/lib/formatters";
import { toast } from "sonner";
import type { DlqEntry, DlqStatus, DlqStatusCounts } from "@/types";
import { DLQ_TRANSITIONS } from "@/types/audit";

const DEFAULT_PAGE_SIZE = parseInt(
  process.env.NEXT_PUBLIC_DEFAULT_PAGE_SIZE ?? "50",
  10,
);

function StatusCountBadges({ counts }: { counts?: DlqStatusCounts }) {
  if (!counts) return null;
  return (
    <div className="flex gap-2 text-xs">
      <Badge variant="warning">{counts.pending} pending</Badge>
      <Badge variant="secondary">{counts.investigated} investigated</Badge>
      <Badge variant="success">{counts.reprocessed} reprocessed</Badge>
      <Badge variant="outline">{counts.discarded} discarded</Badge>
    </div>
  );
}

function DlqViewer() {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [confirmAction, setConfirmAction] = React.useState<{
    type: "investigate" | "reprocess" | "discard";
    entry: DlqEntry;
  } | null>(null);

  const params = {
    status: statusFilter !== "all" ? (statusFilter as DlqStatus) : undefined,
    page,
    pageSize,
  };

  const { data, isLoading, error, mutate: refresh } = useDlqEntries(params);
  const updateStatus = useUpdateDlqStatus();
  const reprocess = useReprocessDlq();

  const entries = data?.data ?? [];
  const meta = data?.meta;
  const statusCounts = meta?.statusCounts;

  const canTransition = (entry: DlqEntry, target: DlqStatus): boolean => {
    return DLQ_TRANSITIONS[entry.status]?.includes(target) ?? false;
  };

  const handleAction = async () => {
    if (!confirmAction) return;
    const { type, entry } = confirmAction;
    try {
      if (type === "investigate") {
        await updateStatus.trigger(entry.id, { status: "investigated" });
        toast.success("Entry marked as investigated");
      } else if (type === "reprocess") {
        await reprocess.trigger(entry.id);
        toast.success("Entry reprocessed successfully");
      } else if (type === "discard") {
        await updateStatus.trigger(entry.id, { status: "discarded" });
        toast.success("Entry discarded");
      }
      setConfirmAction(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      toast.error(message);
    }
  };

  const columns: ColumnDef<DlqEntry>[] = [
    {
      id: "id",
      header: "ID",
      className: "font-mono text-xs w-24",
      render: (row) => row.id.slice(0, 8) + "...",
    },
    {
      id: "originalQueue",
      header: "Queue",
      accessor: "originalQueue",
      className: "font-mono text-xs",
    },
    {
      id: "rejectionReason",
      header: "Error",
      render: (row) => (
        <span className="text-sm" title={row.rejectionReason ?? ""}>
          {row.rejectionReason
            ? row.rejectionReason.length > 60
              ? row.rejectionReason.slice(0, 60) + "..."
              : row.rejectionReason
            : <span className="text-muted-foreground">-</span>}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      id: "retryCount",
      header: "Retries",
      accessor: "retryCount",
      className: "text-center w-20",
    },
    {
      id: "capturedAt",
      header: "Captured",
      render: (row) => (
        <span className="text-sm whitespace-nowrap">
          {formatDate(row.capturedAt)}
        </span>
      ),
    },
  ];

  const getRowActions = (row: DlqEntry): RowAction<DlqEntry>[] => {
    const actions: RowAction<DlqEntry>[] = [];
    if (canTransition(row, "investigated")) {
      actions.push({
        label: "Investigate",
        onClick: (r) => setConfirmAction({ type: "investigate", entry: r }),
      });
    }
    if (canTransition(row, "reprocessed")) {
      actions.push({
        label: "Reprocess",
        onClick: (r) => setConfirmAction({ type: "reprocess", entry: r }),
      });
    }
    if (canTransition(row, "discarded")) {
      actions.push({
        label: "Discard",
        onClick: (r) => setConfirmAction({ type: "discard", entry: r }),
        destructive: true,
        separator: actions.length > 0,
      });
    }
    return actions;
  };

  // Build a unified actions list for all rows (DataTable needs static actions)
  // We'll use conditional rendering within the actions
  const allRowActions: RowAction<DlqEntry>[] = [
    {
      label: "Investigate",
      onClick: (r) => {
        if (canTransition(r, "investigated")) {
          setConfirmAction({ type: "investigate", entry: r });
        } else {
          toast.error(`Cannot investigate entry in '${r.status}' status`);
        }
      },
    },
    {
      label: "Reprocess",
      onClick: (r) => {
        if (canTransition(r, "reprocessed")) {
          setConfirmAction({ type: "reprocess", entry: r });
        } else {
          toast.error(`Cannot reprocess entry in '${r.status}' status`);
        }
      },
    },
    {
      label: "Discard",
      onClick: (r) => {
        if (canTransition(r, "discarded")) {
          setConfirmAction({ type: "discard", entry: r });
        } else {
          toast.error(`Cannot discard entry in '${r.status}' status`);
        }
      },
      destructive: true,
      separator: true,
    },
  ];

  const confirmTitle =
    confirmAction?.type === "investigate"
      ? "Mark as Investigated"
      : confirmAction?.type === "reprocess"
        ? "Reprocess Entry"
        : "Discard Entry";

  const confirmDescription =
    confirmAction?.type === "investigate"
      ? "This will mark the DLQ entry as investigated."
      : confirmAction?.type === "reprocess"
        ? "This will republish the message to its original exchange. The entry status will change to 'reprocessed'."
        : "This will permanently discard this DLQ entry. This action cannot be undone.";

  return (
    <div className="space-y-4">
      {/* Filters + Status Counts */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Select
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="investigated">Investigated</SelectItem>
              <SelectItem value="reprocessed">Reprocessed</SelectItem>
              <SelectItem value="discarded">Discarded</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <StatusCountBadges counts={statusCounts} />
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={() => refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Table */}
      <DataTable<DlqEntry>
        columns={columns}
        data={entries}
        rowKey={(r) => r.id}
        page={page}
        pageSize={pageSize}
        total={meta?.totalCount ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        loading={isLoading}
        error={error?.message}
        onRetry={() => refresh()}
        emptyTitle="No DLQ entries"
        emptyDescription="Dead letter queue is empty. All messages processed successfully."
        emptyIcon={<AlertTriangle className="h-12 w-12 text-muted-foreground" />}
        rowActions={allRowActions}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={
          confirmAction?.type === "discard"
            ? "Discard"
            : confirmAction?.type === "reprocess"
              ? "Reprocess"
              : "Confirm"
        }
        onConfirm={handleAction}
        loading={updateStatus.isMutating || reprocess.isMutating}
      />
    </div>
  );
}

export { DlqViewer };
