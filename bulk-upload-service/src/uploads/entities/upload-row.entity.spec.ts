import { UploadRow, UploadRowStatus } from './upload-row.entity.js';

describe('UploadRow Entity', () => {
  it('should have all UploadRowStatus enum values', () => {
    expect(UploadRowStatus.PENDING).toBe('pending');
    expect(UploadRowStatus.PROCESSING).toBe('processing');
    expect(UploadRowStatus.SUCCEEDED).toBe('succeeded');
    expect(UploadRowStatus.FAILED).toBe('failed');
    expect(UploadRowStatus.SKIPPED).toBe('skipped');
  });

  it('should have 5 status values', () => {
    const values = Object.values(UploadRowStatus);
    expect(values).toHaveLength(5);
  });

  it('should create an upload row entity', () => {
    const row = new UploadRow();
    row.id = 'row-uuid';
    row.uploadId = 'upload-uuid';
    row.rowNumber = 1;
    row.rawData = { eventType: 'order.created' };
    row.status = UploadRowStatus.PENDING;

    expect(row.id).toBe('row-uuid');
    expect(row.uploadId).toBe('upload-uuid');
    expect(row.rowNumber).toBe(1);
    expect(row.status).toBe('pending');
  });

  it('should support group key for group mode', () => {
    const row = new UploadRow();
    row.groupKey = 'order.shipped:ORD-001';
    expect(row.groupKey).toBe('order.shipped:ORD-001');
  });

  it('should have null group key by default', () => {
    const row = new UploadRow();
    expect(row.groupKey).toBeUndefined();
  });
});
