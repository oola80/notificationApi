import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  ROUTING_KEY_UPLOAD_CREATED,
  ROUTING_KEY_UPLOAD_PROCESSING,
  ROUTING_KEY_UPLOAD_PROGRESS,
  ROUTING_KEY_UPLOAD_COMPLETED,
  ROUTING_KEY_UPLOAD_CANCELLED,
  ROUTING_KEY_UPLOAD_RETRIED,
} from './rabbitmq.constants.js';

describe('RabbitMQ Constants', () => {
  it('should define the status exchange', () => {
    expect(EXCHANGE_NOTIFICATIONS_STATUS).toBe('xch.notifications.status');
  });

  it('should define all routing keys with bulk-upload prefix', () => {
    expect(ROUTING_KEY_UPLOAD_CREATED).toBe('bulk-upload.upload.created');
    expect(ROUTING_KEY_UPLOAD_PROCESSING).toBe('bulk-upload.upload.processing');
    expect(ROUTING_KEY_UPLOAD_PROGRESS).toBe('bulk-upload.upload.progress');
    expect(ROUTING_KEY_UPLOAD_COMPLETED).toBe('bulk-upload.upload.completed');
    expect(ROUTING_KEY_UPLOAD_CANCELLED).toBe('bulk-upload.upload.cancelled');
    expect(ROUTING_KEY_UPLOAD_RETRIED).toBe('bulk-upload.upload.retried');
  });
});
