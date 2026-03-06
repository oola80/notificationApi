export type UploadStatus =
  | "queued"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export interface Upload {
  uploadId: string;
  fileName: string;
  fileSize: number;
  totalRows: number;
  totalEvents: number | null;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  status: UploadStatus;
  uploadedBy: string;
  originalFilePath: string | null;
  resultFilePath: string | null;
  resultFileReady: boolean;
  startedAt: string | null;
  completedAt: string | null;
  resultGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadRow {
  rowNumber: number;
  status: "success" | "failed";
  error: string | null;
  data: Record<string, unknown>;
}
