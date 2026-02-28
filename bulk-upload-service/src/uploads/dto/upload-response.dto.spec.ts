import { UploadResponseDto } from './upload-response.dto.js';
import { Upload, UploadStatus } from '../entities/upload.entity.js';

describe('UploadResponseDto', () => {
  const mockUpload: Upload = {
    id: 'test-uuid',
    fileName: 'test.xlsx',
    fileSize: 2048,
    totalRows: 50,
    totalEvents: null,
    processedRows: 0,
    succeededRows: 0,
    failedRows: 0,
    status: UploadStatus.QUEUED,
    uploadedBy: 'user-uuid',
    originalFilePath: '/path/to/original.xlsx',
    resultFilePath: null,
    resultGeneratedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-02-27T10:00:00Z'),
    updatedAt: new Date('2026-02-27T10:00:00Z'),
  };

  it('should map entity to response DTO', () => {
    const dto = UploadResponseDto.fromEntity(mockUpload);

    expect(dto.uploadId).toBe('test-uuid');
    expect(dto.fileName).toBe('test.xlsx');
    expect(dto.fileSize).toBe(2048);
    expect(dto.totalRows).toBe(50);
    expect(dto.status).toBe('queued');
    expect(dto.uploadedBy).toBe('user-uuid');
    expect(dto.resultFileReady).toBe(false);
  });

  it('should set resultFileReady to true when result path exists', () => {
    const upload = {
      ...mockUpload,
      resultFilePath: '/path/to/result.xlsx',
    };
    const dto = UploadResponseDto.fromEntity(upload);

    expect(dto.resultFileReady).toBe(true);
  });

  it('should set resultFileReady to false when result path is null', () => {
    const dto = UploadResponseDto.fromEntity(mockUpload);
    expect(dto.resultFileReady).toBe(false);
  });

  it('should include all timing fields', () => {
    const upload = {
      ...mockUpload,
      startedAt: new Date('2026-02-27T10:01:00Z'),
      completedAt: new Date('2026-02-27T10:05:00Z'),
    };
    const dto = UploadResponseDto.fromEntity(upload);

    expect(dto.startedAt).toEqual(new Date('2026-02-27T10:01:00Z'));
    expect(dto.completedAt).toEqual(new Date('2026-02-27T10:05:00Z'));
  });

  it('should include all counter fields', () => {
    const upload = {
      ...mockUpload,
      processedRows: 50,
      succeededRows: 48,
      failedRows: 2,
    };
    const dto = UploadResponseDto.fromEntity(upload);

    expect(dto.processedRows).toBe(50);
    expect(dto.succeededRows).toBe(48);
    expect(dto.failedRows).toBe(2);
  });
});
