import { Upload } from '../entities/upload.entity.js';

export class UploadStatusResponseDto {
  uploadId: string;
  fileName: string;
  status: string;
  totalRows: number;
  totalEvents: number | null;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  progressPercent: number;
  estimatedTimeRemainingMs: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  resultFileReady: boolean;

  static fromEntity(upload: Upload): UploadStatusResponseDto {
    const dto = new UploadStatusResponseDto();
    dto.uploadId = upload.id;
    dto.fileName = upload.fileName;
    dto.status = upload.status;
    dto.totalRows = upload.totalRows;
    dto.totalEvents = upload.totalEvents;
    dto.processedRows = upload.processedRows;
    dto.succeededRows = upload.succeededRows;
    dto.failedRows = upload.failedRows;
    dto.resultFileReady = !!upload.resultFilePath;
    dto.completedAt = upload.completedAt;
    dto.startedAt = upload.startedAt;

    // Calculate progress
    if (upload.totalRows > 0) {
      dto.progressPercent = Math.floor(
        (upload.processedRows / upload.totalRows) * 100,
      );
    } else {
      dto.progressPercent = 0;
    }

    // Estimate remaining time
    dto.estimatedTimeRemainingMs = null;
    if (upload.startedAt && upload.processedRows > 0 && !upload.completedAt) {
      const elapsedMs = Date.now() - upload.startedAt.getTime();
      const msPerRow = elapsedMs / upload.processedRows;
      const remainingRows = upload.totalRows - upload.processedRows;
      dto.estimatedTimeRemainingMs = Math.round(msPerRow * remainingRows);
    }

    return dto;
  }
}
