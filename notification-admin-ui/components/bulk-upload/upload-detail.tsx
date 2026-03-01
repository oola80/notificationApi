"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, RotateCcw, Clock, CheckCircle2, XCircle, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { StatusBadge, DataTable, PageHeader } from "@/components/shared";
import type { ColumnDef } from "@/components/shared/data-table";
import { ProgressBar } from "./progress-bar";
import {
  useUpload,
  useUploadStatus,
  useUploadErrors,
  useDownloadResult,
  useRetryUpload,
} from "@/hooks/use-bulk-upload";
import { formatDate, formatNumber } from "@/lib/formatters";
import type { Upload, UploadRow, UploadStatus } from "@/types";

const ACTIVE_STATUSES: UploadStatus[] = ["queued", "processing"];

interface UploadDetailProps {
  uploadId: string;
}

function UploadDetail({ uploadId }: UploadDetailProps) {
  const router = useRouter();
  const [errorsPage, setErrorsPage] = React.useState(1);

  // Fetch upload detail
  const { data: upload, error, isLoading } = useUpload(uploadId);

  // Poll status while active
  const isActive = upload
    ? ACTIVE_STATUSES.includes(upload.status)
    : false;
  const { data: statusData } = useUploadStatus(uploadId, isActive);

  // Use polled data when available and active
  const current: Upload | undefined = isActive && statusData
    ? { ...upload!, ...statusData }
    : upload;

  // Errors
  const showErrors =
    current?.failedRows !== undefined && current.failedRows > 0;
  const { data: errorsData, isLoading: errorsLoading } = useUploadErrors(
    uploadId,
    { page: errorsPage, pageSize: 10 },
  );

  // Download
  const { trigger: downloadResult, isDownloading } = useDownloadResult(
    uploadId,
    current?.fileName,
  );

  // Retry
  const { trigger: retryUpload, isMutating: isRetrying } =
    useRetryUpload(uploadId);

  const handleRetry = React.useCallback(async () => {
    try {
      await retryUpload();
      toast.success("Retry started.");
    } catch {
      toast.error("Failed to retry upload.");
    }
  }, [retryUpload]);

  const handleDownload = React.useCallback(async () => {
    try {
      await downloadResult();
      toast.success("Download started.");
    } catch {
      toast.error("Failed to download result.");
    }
  }, [downloadResult]);

  // Progress calculation
  const percentage = React.useMemo(() => {
    if (!current || current.totalRows === 0) return 0;
    return ((current.succeededRows + current.failedRows) / current.totalRows) * 100;
  }, [current]);

  // Error columns
  const errorColumns: ColumnDef<UploadRow>[] = React.useMemo(
    () => [
      {
        id: "rowNumber",
        header: "Row",
        accessor: "rowNumber",
        render: (row) => (
          <span className="font-mono text-sm">{row.rowNumber}</span>
        ),
      },
      {
        id: "error",
        header: "Error",
        accessor: "error",
        render: (row) => (
          <span className="text-sm text-destructive">{row.error}</span>
        ),
      },
      {
        id: "data",
        header: "Row Data",
        render: (row) => (
          <pre className="max-w-md truncate text-xs text-muted-foreground">
            {JSON.stringify(row.data)}
          </pre>
        ),
      },
    ],
    [],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  // Error state
  if (error || !current) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/bulk-upload")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Uploads
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <XCircle className="mb-3 h-10 w-10 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {error?.message ?? "Upload not found."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canDownload =
    current.resultFileReady &&
    (current.status === "completed" || current.status === "partial");
  const canRetry =
    current.status === "failed" || current.status === "partial";

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={current.fileName}
        description="Upload detail and processing status"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/bulk-upload")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            {canDownload && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                <Download className="mr-2 h-4 w-4" />
                {isDownloading ? "Downloading\u2026" : "Download Result"}
              </Button>
            )}
            {canRetry && (
              <Button
                size="sm"
                onClick={handleRetry}
                disabled={isRetrying}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {isRetrying ? "Retrying\u2026" : "Retry Failed Rows"}
              </Button>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<FileSpreadsheet className="h-5 w-5 text-muted-foreground" />}
          label="Status"
          value={<StatusBadge status={current.status} />}
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5 text-muted-foreground" />}
          label="Total Rows"
          value={formatNumber(current.totalRows)}
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          label="Succeeded"
          value={
            <span className="text-green-600">
              {formatNumber(current.succeededRows)}
            </span>
          }
        />
        <SummaryCard
          icon={<XCircle className="h-5 w-5 text-red-600" />}
          label="Failed"
          value={
            <span className={current.failedRows > 0 ? "text-red-600" : ""}>
              {formatNumber(current.failedRows)}
            </span>
          }
        />
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-6">
          <ProgressBar
            percentage={percentage}
            status={current.status}
          />
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>
              Processed: {formatNumber(current.succeededRows + current.failedRows)}{" "}
              / {formatNumber(current.totalRows)} rows
            </span>
            {current.startedAt && (
              <span>Started: {formatDate(current.startedAt)}</span>
            )}
            {current.completedAt && (
              <span>Completed: {formatDate(current.completedAt)}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error rows */}
      {showErrors && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Failed Rows ({formatNumber(current.failedRows)})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={errorColumns}
              data={errorsData?.data ?? []}
              rowKey={(row) => row.rowNumber}
              page={errorsPage}
              pageSize={10}
              total={errorsData?.total ?? 0}
              onPageChange={setErrorsPage}
              loading={errorsLoading}
              emptyTitle="No errors"
              emptyDescription="All rows were processed successfully."
            />
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <DetailRow label="Upload ID" value={current.id} mono />
            <DetailRow
              label="File Size"
              value={formatFileSize(current.fileSize)}
            />
            <DetailRow label="Uploaded" value={formatDate(current.createdAt)} />
            <DetailRow
              label="Last Updated"
              value={formatDate(current.updatedAt)}
            />
            {current.uploadedBy && (
              <DetailRow label="Uploaded By" value={current.uploadedBy} />
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Sub-components ---

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        {icon}
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 font-medium", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export { UploadDetail };
export type { UploadDetailProps };
