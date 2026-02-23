import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { RabbitMQHealthIndicator } from './rabbitmq.health-indicator.js';

describe('RabbitMQHealthIndicator', () => {
  let indicator: RabbitMQHealthIndicator;
  let amqpConnection: { connected: boolean };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'rabbitmq.managementUrl': 'http://localhost:15672',
        'rabbitmq.user': 'guest',
        'rabbitmq.password': 'guest',
        'rabbitmq.vhost': 'vhnotificationapi',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    amqpConnection = { connected: true };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQHealthIndicator,
        { provide: AmqpConnection, useValue: amqpConnection },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    indicator = module.get<RabbitMQHealthIndicator>(RabbitMQHealthIndicator);

    // Mock fetchQueueDepths to avoid real HTTP calls
    jest.spyOn(indicator as any, 'fetchQueueDepths').mockResolvedValue({
      'q.events.amqp': { depth: 5, consumers: 2 },
      'q.events.webhook': { depth: 0, consumers: 1 },
      'q.events.email-ingest': { depth: 10, consumers: 1 },
    });
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  it('should report healthy when connected', async () => {
    const result = await indicator.isHealthy('rabbitmq');

    expect(result.rabbitmq.status).toBe('up');
    expect(result.rabbitmq.connected).toBe(true);
  });

  it('should include queue depths when available', async () => {
    const result = await indicator.isHealthy('rabbitmq');

    expect(result.rabbitmq.queues).toBeDefined();
    expect(result.rabbitmq.queues['q.events.amqp']).toEqual({
      depth: 5,
      consumers: 2,
    });
  });

  it('should report unhealthy when disconnected', async () => {
    amqpConnection.connected = false;

    const result = await indicator.isHealthy('rabbitmq');

    expect(result.rabbitmq.status).toBe('down');
    expect(result.rabbitmq.connected).toBe(false);
  });

  it('should still report connected status when Management API fails', async () => {
    jest
      .spyOn(indicator as any, 'fetchQueueDepths')
      .mockRejectedValue(new Error('Network error'));

    const result = await indicator.isHealthy('rabbitmq');

    expect(result.rabbitmq.status).toBe('up');
    expect(result.rabbitmq.connected).toBe(true);
    expect(result.rabbitmq.queues).toBeUndefined();
  });
});
