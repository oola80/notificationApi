import { RabbitMQPublisherService } from './rabbitmq-publisher.service.js';
import { WebhookEventDto, WebhookEventType } from '../dto/webhook-event.dto.js';
import { MetricsService } from '../metrics/metrics.service.js';

describe('RabbitMQPublisherService', () => {
  let publisher: RabbitMQPublisherService;
  let mockAmqpConnection: any;
  let metricsService: MetricsService;

  function createEvent(): WebhookEventDto {
    const event = new WebhookEventDto();
    event.providerId = 'mailgun';
    event.providerName = 'Mailgun';
    event.providerMessageId = 'msg-123';
    event.eventType = WebhookEventType.DELIVERED;
    event.rawStatus = 'delivered';
    event.notificationId = 'notif-456';
    event.correlationId = 'corr-789';
    event.cycleId = 'cycle-000';
    event.recipientAddress = 'user@example.com';
    event.timestamp = new Date().toISOString();
    event.metadata = {};
    return event;
  }

  beforeEach(() => {
    mockAmqpConnection = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    metricsService = new MetricsService();
    jest.spyOn(metricsService, 'incrementRabbitmqPublish');
    publisher = new RabbitMQPublisherService(
      mockAmqpConnection,
      metricsService,
    );
  });

  it('should publish webhook event to correct exchange and routing key', () => {
    const event = createEvent();
    publisher.publishWebhookEvent(event);

    expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
      'xch.notifications.status',
      'adapter.webhook.mailgun',
      event,
      expect.objectContaining({
        persistent: true,
        contentType: 'application/json',
      }),
    );
    expect(metricsService.incrementRabbitmqPublish).toHaveBeenCalledWith(
      'mailgun',
      'success',
    );
  });

  it('should handle publish failure gracefully', () => {
    mockAmqpConnection.publish.mockImplementation(() => {
      throw new Error('Connection lost');
    });

    const event = createEvent();
    expect(() => publisher.publishWebhookEvent(event)).not.toThrow();
    expect(metricsService.incrementRabbitmqPublish).toHaveBeenCalledWith(
      'mailgun',
      'failed',
    );
  });

  it('should handle null amqp connection gracefully', () => {
    const publisherNoConnection = new RabbitMQPublisherService(
      null,
      metricsService,
    );
    const event = createEvent();

    expect(() => publisherNoConnection.publishWebhookEvent(event)).not.toThrow();
    expect(metricsService.incrementRabbitmqPublish).toHaveBeenCalledWith(
      'mailgun',
      'failed',
    );
  });
});
