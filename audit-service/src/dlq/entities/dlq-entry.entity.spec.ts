import { DlqEntry, DlqEntryStatus } from './dlq-entry.entity';

describe('DlqEntry Entity', () => {
  it('should create an instance with all properties', () => {
    const entry = new DlqEntry();
    entry.id = 'dlq-e29b-41d4';
    entry.originalQueue = 'q.deliver.email.normal';
    entry.originalExchange = 'xch.notifications.deliver';
    entry.originalRoutingKey = 'notification.deliver.normal.email';
    entry.rejectionReason = 'max retries exhausted';
    entry.retryCount = 5;
    entry.payload = { notificationId: 'notif-123' };
    entry.xDeathHeaders = [{ queue: 'q.deliver.email.normal', count: 5 }];
    entry.status = DlqEntryStatus.PENDING;
    entry.notes = null;
    entry.capturedAt = new Date();
    entry.resolvedAt = null;
    entry.resolvedBy = null;

    expect(entry.originalQueue).toBe('q.deliver.email.normal');
    expect(entry.status).toBe('pending');
    expect(entry.retryCount).toBe(5);
  });

  it('should support all status values', () => {
    expect(DlqEntryStatus.PENDING).toBe('pending');
    expect(DlqEntryStatus.INVESTIGATED).toBe('investigated');
    expect(DlqEntryStatus.REPROCESSED).toBe('reprocessed');
    expect(DlqEntryStatus.DISCARDED).toBe('discarded');
  });

  it('should allow resolved fields when status changes', () => {
    const entry = new DlqEntry();
    entry.originalQueue = 'q.deliver.email.normal';
    entry.originalExchange = 'xch.notifications.deliver';
    entry.payload = {};
    entry.status = DlqEntryStatus.INVESTIGATED;
    entry.notes = 'Root cause: API key expired';
    entry.resolvedAt = new Date();
    entry.resolvedBy = 'admin@company.com';

    expect(entry.status).toBe('investigated');
    expect(entry.notes).toBe('Root cause: API key expired');
    expect(entry.resolvedBy).toBe('admin@company.com');
  });
});
