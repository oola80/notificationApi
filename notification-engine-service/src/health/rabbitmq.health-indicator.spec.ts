import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { RabbitMQHealthIndicator } from './rabbitmq.health-indicator.js';

describe('RabbitMQHealthIndicator', () => {
  let indicator: RabbitMQHealthIndicator;
  let amqpConnection: { connected: boolean };

  beforeEach(async () => {
    amqpConnection = { connected: true };

    // Mock global fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: 5, consumers: 2 }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQHealthIndicator,
        {
          provide: AmqpConnection,
          useValue: amqpConnection,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              const map: Record<string, string> = {
                'rabbitmq.managementUrl': 'http://localhost:15672',
                'rabbitmq.user': 'notificationapi',
                'rabbitmq.password': 'secret',
                'rabbitmq.vhost': 'vhnotificationapi',
              };
              return map[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    indicator = module.get<RabbitMQHealthIndicator>(RabbitMQHealthIndicator);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  it('should return healthy when connected', async () => {
    const result = await indicator.isHealthy('rabbitmq');

    expect(result.rabbitmq.status).toBe('up');
    expect(result.rabbitmq.queues).toBeDefined();
  });

  it('should return unhealthy when disconnected', async () => {
    amqpConnection.connected = false;

    const result = await indicator.isHealthy('rabbitmq');

    expect(result.rabbitmq.status).toBe('down');
    expect(result.rabbitmq.message).toBe('RabbitMQ disconnected');
  });

  it('should fetch queue depths for NES queues', async () => {
    const result = await indicator.isHealthy('rabbitmq');

    const queues = result.rabbitmq.queues as Record<string, any>;
    expect(queues['q.engine.events.critical']).toBeDefined();
    expect(queues['q.engine.events.normal']).toBeDefined();
    expect(queues['q.engine.status.inbound']).toBeDefined();
  });

  it('should handle management API failure gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(
      new Error('Connection refused'),
    );

    const result = await indicator.isHealthy('rabbitmq');

    // Should still report connected even if management API is down
    expect(result.rabbitmq.status).toBe('up');
  });

  it('should handle individual queue fetch failure gracefully', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: 3, consumers: 1 }),
      })
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: 0, consumers: 2 }),
      });

    const result = await indicator.isHealthy('rabbitmq');

    expect(result.rabbitmq.status).toBe('up');
    const queues = result.rabbitmq.queues as Record<string, any>;
    expect(queues['q.engine.events.critical']).toEqual({
      messages: 3,
      consumers: 1,
    });
    expect(queues['q.engine.events.normal']).toEqual({
      messages: -1,
      consumers: -1,
    });
  });
});
