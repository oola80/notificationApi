"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, RotateCcw, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  useUploads,
  useDeleteUpload,
  useRetryUpload,
  useDownloadResult,
} from "@/hooks/use-bulk-upload";
import { DataTable, ConfirmDialog, StatusBadge } from "@/components/shared";
import type { ColumnDef, RowAction } from "@/components/shared/data-table";
import { formatDate, formatNumber } from "@/lib/formatters";
import type { Upload, UploadStatus } from "@/types";

const POLLING_INTERVAL = parseInt(
  process.env.NEXT_PUBLIC_POLLING_INTERVAL_UPLOAD ?? "5000",
  10,
);

const PROCESSING_STATUSES: UploadStatus[] = ["queued", "processing"];

interface UploadHistoryProps {
  className?: string;
}

function UploadHistory({ className }: UploadHistoryProps) {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(10);
  const [deleteTarget, setDeleteTarget] = React.useState<Upload | null>(null);

  const { data, error, isLoading, mutate } = useUploads({ page, pageSize });

  // Auto-refresh when any upload is in a processing state
  const hasProcessing = React.useMemo(
    () =>
      data?.data?.some((u) =>
        PROCESSING_STATUSES.includes(u.status),
      ) ?? false,
    [data],
  );

  React.useEffect(() => {
    if (!hasProcessing) return;
    const interval = setInterval(() => {
      mutate();
    }, POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, [hasProcessing, mutate]);

  // Delete
  const deleteId = deleteTarget?.uploadId ?? "";
  const { trigger: doDelete, isMutating: isDeleting } =
    useDeleteUpload(deleteId);

  const handleDelete = React.useCallback(async () => {
    try {
      await doDelete();
      toast.success("Upload deleted.");
      setDeleteTarget(null);
      mutate();
    } catch {
      toast.error("Failed to delete upload.");
    }
  }, [doDelete, mutate]);

  // Columns
  const columns: ColumnDef<Upload>[] = React.useMemo(
    () => [
      {
        id: "fileName",
        header: "File Name",
        accessor: "fileName",
        render: (row) => (
          <span className="font-medium">{row.fileName}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessor: "status",
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        id: "totalRows",
        header: "Total Rows",
        accessor: "totalRows",
        render: (row) => formatNumber(row.totalRows),
      },
      {
        id: "progress",
        header: "Success / Failed",
        render: (row) => (
          <span className="tabular-nums">
            <span className="text-green-600">
              {formatNumber(row.succeededRows)}
            </span>
            {" / "}
            <span className={row.failedRows > 0 ? "text-red-600" : ""}>
              {formatNumber(row.failedRows)}
            </span>
          </span>
        ),
      },
      {
        id: "createdAt",
        header: "Uploaded",
        accessor: "createdAt",
        render: (row) => formatDate(row.createdAt),
      },
    ],
    [],
  );

  // Row actions (dynamic per row)
  const rowActions: RowAction<Upload>[] = React.useMemo(
    () => [
      {
        label: "View Detail",
        icon: <Eye className="h-4 w-4" />,
        onClick: (row) => router.push(`/bulk-upload/${row.uploadId}`),
      },
      {
        label: "Download Result",
        icon: <Download className="h-4 w-4" />,
        onClick: (row) => {
          // Trigger download inline
          downloadResult(row.uploadId, row.fileName);
        },
      },
      {
        label: "Retry",
        icon: <RotateCcw className="h-4 w-4" />,
        onClick: (row) => {
          retryUpload(row.uploadId);
        },
      },
      {
        label: "Delete",
        icon: <Trash2 className="h-4 w-4" />,
        onClick: (row) => setDeleteTarget(row),
        destructive: true,
        separator: true,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className={className}>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        rowKey={(row) => row.uploadId}
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        loading={isLoading}
        error={error?.message}
        onRetry={() => mutate()}
        onRowClick={(row) => router.push(`/bulk-upload/${row.uploadId}`)}
        rowActions={rowActions}
        emptyTitle="No uploads yet"
        emptyDescription="Upload an XLSX file using the drop zone above."
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Upload"
        description={`Are you sure you want to delete "${deleteTarget?.fileName}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        loading={isDeleting}
      />
    </div>
  );
}

// Helper: trigger result download
async function downloadResult(id: string, fileName: string) {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BULK_UPLOAD_URL ?? "http://localhost:3158";
    const response = await fetch(`${baseUrl}/api/v1/uploads/${id}/result`);
    if (!response.ok) {
      toast.error("Result file is not available yet.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName.replace(/\.xlsx$/i, "") + "-result.xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success("Download started.");
  } catch {
    toast.error("Failed to download result file.");
  }
}

// Helper: retry upload
async function retryUpload(id: string) {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BULK_UPLOAD_URL ?? "http://localhost:3158";
    const response = await fetch(`${baseUrl}/api/v1/uploads/${id}/retry`, {
      method: "POST",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      toast.error(body.message ?? "Cannot retry this upload.");
      return;
    }
    toast.success("Retry started.");
  } catch {
    toast.error("Failed to retry upload.");
  }
}

export { UploadHistory };
export type { UploadHistoryProps };
