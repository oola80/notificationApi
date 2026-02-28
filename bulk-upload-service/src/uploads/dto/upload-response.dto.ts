import { Upload } from '../entities/upload.entity.js';

export class UploadResponseDto {
  uploadId: string;
  fileName: string;
  fileSize: number;
  totalRows: number;
  totalEvents: number | null;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  status: string;
  uploadedBy: string;
  originalFilePath: string | null;
  resultFilePath: string | null;
  resultFileReady: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(upload: Upload): UploadResponseDto {
    const dto = new UploadResponseDto();
    dto.uploadId = upload.id;
    dto.fileName = upload.fileName;
    dto.fileSize = upload.fileSize;
    dto.totalRows = upload.totalRows;
    dto.totalEvents = upload.totalEvents;
    dto.processedRows = upload.processedRows;
    dto.succeededRows = upload.succeededRows;
    dto.failedRows = upload.failedRows;
    dto.status = upload.status;
    dto.uploadedBy = upload.uploadedBy;
    dto.originalFilePath = upload.originalFilePath;
    dto.resultFilePath = upload.resultFilePath;
    dto.resultFileReady = !!upload.resultFilePath;
    dto.startedAt = upload.startedAt;
    dto.completedAt = upload.completedAt;
    dto.createdAt = upload.createdAt;
    dto.updatedAt = upload.updatedAt;
    return dto;
  }
}
