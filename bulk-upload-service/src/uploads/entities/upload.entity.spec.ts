import { Upload, UploadStatus } from './upload.entity.js';

describe('Upload Entity', () => {
  it('should have all UploadStatus enum values', () => {
    expect(UploadStatus.QUEUED).toBe('queued');
    expect(UploadStatus.PROCESSING).toBe('processing');
    expect(UploadStatus.COMPLETED).toBe('completed');
    expect(UploadStatus.PARTIAL).toBe('partial');
    expect(UploadStatus.FAILED).toBe('failed');
    expect(UploadStatus.CANCELLED).toBe('cancelled');
  });

  it('should have 6 status values', () => {
    const values = Object.values(UploadStatus);
    expect(values).toHaveLength(6);
  });

  it('should create an upload entity', () => {
    const upload = new Upload();
    upload.id = 'test-uuid';
    upload.fileName = 'test.xlsx';
    upload.fileSize = 1024;
    upload.totalRows = 10;
    upload.status = UploadStatus.QUEUED;
    upload.uploadedBy = 'user-uuid';

    expect(upload.id).toBe('test-uuid');
    expect(upload.fileName).toBe('test.xlsx');
    expect(upload.status).toBe('queued');
  });

  it('should have nullable fields default to null', () => {
    const upload = new Upload();
    expect(upload.totalEvents).toBeUndefined();
    expect(upload.resultFilePath).toBeUndefined();
    expect(upload.startedAt).toBeUndefined();
    expect(upload.completedAt).toBeUndefined();
  });
});
