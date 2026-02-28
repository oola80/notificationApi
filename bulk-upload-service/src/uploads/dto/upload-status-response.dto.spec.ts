import { UploadStatusResponseDto } from './upload-status-response.dto.js';
import { Upload, UploadStatus } from '../entities/upload.entity.js';

describe('UploadStatusResponseDto', () => {
  const baseUpload: Upload = {
    id: 'test-uuid',
    fileName: 'test.xlsx',
    fileSize: 2048,
    totalRows: 100,
    totalEvents: null,
    processedRows: 0,
    succeededRows: 0,
    failedRows: 0,
    status: UploadStatus.QUEUED,
    uploadedBy: 'user-uuid',
    originalFilePath: null,
    resultFilePath: null,
    resultGeneratedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should calculate 0% progress for queued upload', () => {
    const dto = UploadStatusResponseDto.fromEntity(baseUpload);
    expect(dto.progressPercent).toBe(0);
    expect(dto.estimatedTimeRemainingMs).toBeNull();
  });

  it('should calculate 50% progress for half-processed upload', () => {
    const upload = {
      ...baseUpload,
      status: UploadStatus.PROCESSING,
      processedRows: 50,
      startedAt: new Date(Date.now() - 10000),
    };
    const dto = UploadStatusResponseDto.fromEntity(upload);
    expect(dto.progressPercent).toBe(50);
  });

  it('should calculate 100% progress for completed upload', () => {
    const upload = {
      ...baseUpload,
      status: UploadStatus.COMPLETED,
      processedRows: 100,
      completedAt: new Date(),
    };
    const dto = UploadStatusResponseDto.fromEntity(upload);
    expect(dto.progressPercent).toBe(100);
  });

  it('should estimate remaining time for processing upload', () => {
    const upload = {
      ...baseUpload,
      status: UploadStatus.PROCESSING,
      processedRows: 50,
      startedAt: new Date(Date.now() - 10000), // 10 seconds ago
    };
    const dto = UploadStatusResponseDto.fromEntity(upload);
    // ~200ms/row, 50 remaining → ~10000ms
    expect(dto.estimatedTimeRemainingMs).toBeGreaterThan(0);
  });

  it('should return null estimated time when no progress', () => {
    const upload = {
      ...baseUpload,
      status: UploadStatus.PROCESSING,
      processedRows: 0,
      startedAt: new Date(),
    };
    const dto = UploadStatusResponseDto.fromEntity(upload);
    expect(dto.estimatedTimeRemainingMs).toBeNull();
  });

  it('should return null estimated time for completed upload', () => {
    const upload = {
      ...baseUpload,
      processedRows: 100,
      startedAt: new Date(Date.now() - 60000),
      completedAt: new Date(),
    };
    const dto = UploadStatusResponseDto.fromEntity(upload);
    expect(dto.estimatedTimeRemainingMs).toBeNull();
  });

  it('should set resultFileReady based on resultFilePath', () => {
    const dto1 = UploadStatusResponseDto.fromEntity(baseUpload);
    expect(dto1.resultFileReady).toBe(false);

    const upload = {
      ...baseUpload,
      resultFilePath: '/path/to/result.xlsx',
    };
    const dto2 = UploadStatusResponseDto.fromEntity(upload);
    expect(dto2.resultFileReady).toBe(true);
  });

  it('should handle 0 totalRows gracefully', () => {
    const upload = { ...baseUpload, totalRows: 0 };
    const dto = UploadStatusResponseDto.fromEntity(upload);
    expect(dto.progressPercent).toBe(0);
  });

  it('should floor progress percent', () => {
    const upload = {
      ...baseUpload,
      totalRows: 3,
      processedRows: 1,
    };
    const dto = UploadStatusResponseDto.fromEntity(upload);
    expect(dto.progressPercent).toBe(33); // floor(1/3 * 100) = 33
  });
});
