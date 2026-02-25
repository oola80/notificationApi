import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { StatusInboundConsumer } from './status-inbound.consumer.js';
import { NotificationLifecycleService } from '../notifications/notification-lifecycle.service.js';

describe('StatusInboundConsumer', () => {
  let consumer: StatusInboundConsumer;
  let lifecycleService: jest.Mocked<NotificationLifecycleService>;

  const mockAmqpMsg = {
    fields: { routingKey: 'notification.status.delivered' },
    properties: { headers: {} },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusInboundConsumer,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: any) => {
              const map: Record<string, any> = {
                'rabbitmq.dlqMaxRetries': 3,
                'rabbitmq.retryInitialDelayMs': 1000,
                'rabbitmq.retryBackoffMultiplier': 2,
                'rabbitmq.retryMaxDelayMs': 30000,
              };
              return map[key] ?? def;
            }),
          },
        },
        {
          provide: AmqpConnection,
          useValue: { publish: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: NotificationLifecycleService,
          useValue: {
            transition: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    consumer = module.get<StatusInboundConsumer>(StatusInboundConsumer);
    lifecycleService = module.get(NotificationLifecycleService);

    jest.spyOn(consumer as any, 'delay').mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should transition notification to DELIVERED', async () => {
    await consumer.handleStatusInbound(
      {
        notificationId: 'notif-1',
        toStatus: 'DELIVERED',
        metadata: { provider: 'sendgrid' },
      },
      mockAmqpMsg,
    );

    expect(lifecycleService.transition).toHaveBeenCalledWith(
      'notif-1',
      'DELIVERED',
      { provider: 'sendgrid' },
    );
  });

  it('should transition notification to FAILED', async () => {
    await consumer.handleStatusInbound(
      {
        notificationId: 'notif-2',
        toStatus: 'FAILED',
        metadata: { errorMessage: 'Bounce' },
      },
      { ...mockAmqpMsg, fields: { routingKey: 'notification.status.failed' } },
    );

    expect(lifecycleService.transition).toHaveBeenCalledWith(
      'notif-2',
      'FAILED',
      { errorMessage: 'Bounce' },
    );
  });

  it('should call retryOrDlq on lifecycle error', async () => {
    const error = new Error('DB error');
    lifecycleService.transition.mockRejectedValue(error);

    const retrySpy = jest.spyOn(consumer as any, 'retryOrDlq');

    await consumer.handleStatusInbound(
      { notificationId: 'notif-3', toStatus: 'DELIVERED' },
      mockAmqpMsg,
    );

    expect(retrySpy).toHaveBeenCalledWith(
      { notificationId: 'notif-3', toStatus: 'DELIVERED' },
      mockAmqpMsg,
      error,
    );
  });

  it('should handle missing metadata', async () => {
    await consumer.handleStatusInbound(
      { notificationId: 'notif-4', toStatus: 'DELIVERED' },
      mockAmqpMsg,
    );

    expect(lifecycleService.transition).toHaveBeenCalledWith(
      'notif-4',
      'DELIVERED',
      undefined,
    );
  });
});
