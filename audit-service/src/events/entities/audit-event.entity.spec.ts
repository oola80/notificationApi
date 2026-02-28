import { AuditEvent } from './audit-event.entity';

describe('AuditEvent Entity', () => {
  it('should create an instance with all properties', () => {
    const event = new AuditEvent();
    event.id = '550e8400-e29b-41d4-a716-446655440000';
    event.notificationId = 'notif-456';
    event.correlationId = 'corr-abc-123';
    event.cycleId = 'CYC-2026-00451';
    event.eventType = 'DELIVERY_ATTEMPTED';
    event.actor = 'channel-router-service';
    event.metadata = { channel: 'email', provider: 'mailgun', attempt: 1 };
    event.payloadSnapshot = { subject: 'Your order has shipped' };
    event.searchVector = null;
    event.createdAt = new Date();

    expect(event.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(event.notificationId).toBe('notif-456');
    expect(event.correlationId).toBe('corr-abc-123');
    expect(event.cycleId).toBe('CYC-2026-00451');
    expect(event.eventType).toBe('DELIVERY_ATTEMPTED');
    expect(event.actor).toBe('channel-router-service');
    expect(event.metadata).toEqual({
      channel: 'email',
      provider: 'mailgun',
      attempt: 1,
    });
    expect(event.payloadSnapshot).toEqual({ subject: 'Your order has shipped' });
  });

  it('should allow nullable fields to be null', () => {
    const event = new AuditEvent();
    event.eventType = 'TEMPLATE_CREATED';
    event.actor = 'template-service';

    expect(event.notificationId).toBeUndefined();
    expect(event.correlationId).toBeUndefined();
    expect(event.cycleId).toBeUndefined();
    expect(event.payloadSnapshot).toBeUndefined();
  });
});
