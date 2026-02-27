import { DeliveryAttempt } from './delivery-attempt.entity.js';

describe('DeliveryAttempt Entity', () => {
  it('should create a DeliveryAttempt instance', () => {
    const attempt = new DeliveryAttempt();
    attempt.id = '550e8400-e29b-41d4-a716-446655440030';
    attempt.notificationId = '550e8400-e29b-41d4-a716-446655440031';
    attempt.correlationId = '550e8400-e29b-41d4-a716-446655440032';
    attempt.channel = 'email';
    attempt.providerId = '550e8400-e29b-41d4-a716-446655440020';
    attempt.attemptNumber = 1;
    attempt.status = 'SENT';
    attempt.providerResponse = { messageId: 'abc123' };
    attempt.providerMessageId = 'abc123';
    attempt.errorMessage = null;
    attempt.metadata = null;
    attempt.attemptedAt = new Date();
    attempt.durationMs = 250;

    expect(attempt.notificationId).toBe('550e8400-e29b-41d4-a716-446655440031');
    expect(attempt.channel).toBe('email');
    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.status).toBe('SENT');
    expect(attempt.durationMs).toBe(250);
  });

  it('should support all status values', () => {
    const attempt = new DeliveryAttempt();

    for (const status of ['SENT', 'DELIVERED', 'FAILED', 'RETRYING']) {
      attempt.status = status;
      expect(attempt.status).toBe(status);
    }
  });

  it('should support nullable fields', () => {
    const attempt = new DeliveryAttempt();
    attempt.correlationId = null;
    attempt.providerResponse = null;
    attempt.providerMessageId = null;
    attempt.errorMessage = null;
    attempt.metadata = null;
    attempt.durationMs = null;

    expect(attempt.correlationId).toBeNull();
    expect(attempt.providerResponse).toBeNull();
    expect(attempt.providerMessageId).toBeNull();
    expect(attempt.errorMessage).toBeNull();
    expect(attempt.metadata).toBeNull();
    expect(attempt.durationMs).toBeNull();
  });

  it('should support error details on failure', () => {
    const attempt = new DeliveryAttempt();
    attempt.status = 'FAILED';
    attempt.errorMessage = 'Connection timeout to adapter service';
    attempt.metadata = {
      errorType: 'TIMEOUT',
      adapterUrl: 'http://localhost:3170',
    };

    expect(attempt.errorMessage).toBe('Connection timeout to adapter service');
    expect(attempt.metadata).toEqual({
      errorType: 'TIMEOUT',
      adapterUrl: 'http://localhost:3170',
    });
  });
});
