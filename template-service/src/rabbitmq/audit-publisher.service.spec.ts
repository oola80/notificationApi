import { AuditPublisherService } from './audit-publisher.service.js';

describe('AuditPublisherService', () => {
  let service: AuditPublisherService;
  let mockAmqpConnection: any;
  let mockMetricsService: any;

  beforeEach(() => {
    mockAmqpConnection = {
      publish: jest.fn(),
    };
    mockMetricsService = {
      incrementAuditPublishFailure: jest.fn(),
    };
    service = new AuditPublisherService(mockAmqpConnection, mockMetricsService);
  });

  describe('publishTemplateCreated', () => {
    it('should publish to xch.notifications.status with template.template.created routing key', () => {
      const template = { id: 'abc-123', slug: 'order-confirm', name: 'Order Confirmation' };

      service.publishTemplateCreated(template);

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'xch.notifications.status',
        'template.template.created',
        expect.objectContaining({
          eventType: 'template.template.created',
          service: 'template-service',
          data: { templateId: 'abc-123', slug: 'order-confirm', name: 'Order Confirmation' },
        }),
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
        }),
      );
    });

    it('should include correlationId in headers when provided', () => {
      const template = { id: 'abc-123', slug: 'test', name: 'Test' };

      service.publishTemplateCreated(template, 'corr-456');

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'xch.notifications.status',
        'template.template.created',
        expect.objectContaining({ correlationId: 'corr-456' }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-correlation-id': 'corr-456',
          }),
        }),
      );
    });
  });

  describe('publishTemplateUpdated', () => {
    it('should publish with version number in data', () => {
      const template = { id: 'abc-123', slug: 'order-confirm' };

      service.publishTemplateUpdated(template, 3);

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'xch.notifications.status',
        'template.template.updated',
        expect.objectContaining({
          eventType: 'template.template.updated',
          data: { templateId: 'abc-123', slug: 'order-confirm', versionNumber: 3 },
        }),
        expect.any(Object),
      );
    });
  });

  describe('publishTemplateDeleted', () => {
    it('should publish with templateId in data', () => {
      service.publishTemplateDeleted('abc-123');

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'xch.notifications.status',
        'template.template.deleted',
        expect.objectContaining({
          eventType: 'template.template.deleted',
          data: { templateId: 'abc-123' },
        }),
        expect.any(Object),
      );
    });
  });

  describe('publishTemplateRolledback', () => {
    it('should publish with fromVersion and toVersion', () => {
      const template = { id: 'abc-123', slug: 'order-confirm' };

      service.publishTemplateRolledback(template, 3, 1);

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'xch.notifications.status',
        'template.template.rolledback',
        expect.objectContaining({
          eventType: 'template.template.rolledback',
          data: {
            templateId: 'abc-123',
            slug: 'order-confirm',
            fromVersion: 3,
            toVersion: 1,
          },
        }),
        expect.any(Object),
      );
    });
  });

  describe('publishRenderCompleted', () => {
    it('should publish render completion with duration', () => {
      service.publishRenderCompleted('abc-123', 'email', 2, 15.5);

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'xch.notifications.status',
        'template.render.completed',
        expect.objectContaining({
          eventType: 'template.render.completed',
          data: {
            templateId: 'abc-123',
            channel: 'email',
            versionNumber: 2,
            durationMs: 15.5,
          },
        }),
        expect.any(Object),
      );
    });
  });

  describe('publishRenderFailed', () => {
    it('should publish render failure with error message', () => {
      service.publishRenderFailed('abc-123', 'sms', 'Template rendering failed');

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'xch.notifications.status',
        'template.render.failed',
        expect.objectContaining({
          eventType: 'template.render.failed',
          data: {
            templateId: 'abc-123',
            channel: 'sms',
            error: 'Template rendering failed',
          },
        }),
        expect.any(Object),
      );
    });
  });

  describe('fire-and-forget error handling', () => {
    it('should not throw when publish fails', () => {
      mockAmqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      expect(() => {
        service.publishTemplateCreated({ id: 'abc', slug: 'test', name: 'Test' });
      }).not.toThrow();
    });

    it('should log warning when publish fails', () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn');
      mockAmqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      service.publishTemplateDeleted('abc-123');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to publish audit event'),
      );
    });

    it('should include timestamp in all messages', () => {
      service.publishTemplateCreated({ id: 'abc', slug: 'test', name: 'Test' });

      const publishedMessage = mockAmqpConnection.publish.mock.calls[0][2];
      expect(publishedMessage.timestamp).toBeDefined();
      expect(() => new Date(publishedMessage.timestamp)).not.toThrow();
    });

    it('should increment audit publish failure metric on error', () => {
      mockAmqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      service.publishTemplateCreated({ id: 'abc', slug: 'test', name: 'Test' });

      expect(mockMetricsService.incrementAuditPublishFailure).toHaveBeenCalled();
    });

    it('should not throw when metricsService is not available', () => {
      const serviceNoMetrics = new AuditPublisherService(mockAmqpConnection);
      mockAmqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      expect(() => {
        serviceNoMetrics.publishTemplateCreated({ id: 'abc', slug: 'test', name: 'Test' });
      }).not.toThrow();
    });
  });
});
