import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller.js';
import { RabbitMQHealthIndicator } from './rabbitmq.health-indicator.js';
import { RuleCacheService } from '../rules/rule-cache.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSource: { query: jest.Mock };
  let amqpConnection: { connected: boolean };

  beforeEach(async () => {
    dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    amqpConnection = { connected: true };

    // Mock global fetch for template service check
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DataSource, useValue: dataSource },
        { provide: AmqpConnection, useValue: amqpConnection },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              if (key === 'app.templateServiceUrl')
                return 'http://localhost:3153';
              return def;
            }),
          },
        },
        {
          provide: RuleCacheService,
          useValue: {
            isEnabled: jest.fn().mockReturnValue(true),
            size: 12,
            getLastInvalidation: jest
              .fn()
              .mockReturnValue('2026-02-20T09:45:00Z'),
          },
        },
        {
          provide: RabbitMQHealthIndicator,
          useValue: {
            isHealthy: jest.fn().mockResolvedValue({
              rabbitmq: {
                status: 'up',
                queues: {
                  'q.engine.events.critical': { messages: 3, consumers: 4 },
                  'q.engine.events.normal': { messages: 28, consumers: 2 },
                  'q.engine.status.inbound': { messages: 0, consumers: 2 },
                },
              },
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return healthy status when all checks pass', async () => {
    const result = await controller.check();

    expect(result.status).toBe('healthy');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.rabbitmq.status).toBe('up');
    expect(result.checks.templateService.status).toBe('up');
  });

  it('should include all check fields in response', async () => {
    const result = await controller.check();

    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('uptime');
    expect(result.checks).toHaveProperty('database');
    expect(result.checks).toHaveProperty('rabbitmq');
    expect(result.checks).toHaveProperty('templateService');
    expect(result.checks).toHaveProperty('queues');
    expect(result.checks).toHaveProperty('ruleCache');
  });

  it('should report database latency', async () => {
    const result = await controller.check();

    expect(result.checks.database).toHaveProperty('latencyMs');
    expect(typeof result.checks.database.latencyMs).toBe('number');
  });

  it('should return unhealthy when database is down', async () => {
    dataSource.query.mockRejectedValue(new Error('Connection refused'));

    const result = await controller.check();

    expect(result.status).toBe('unhealthy');
    expect(result.checks.database.status).toBe('down');
  });

  it('should return unhealthy when RabbitMQ is down', async () => {
    amqpConnection.connected = false;

    const result = await controller.check();

    expect(result.status).toBe('unhealthy');
    expect(result.checks.rabbitmq.status).toBe('down');
  });

  it('should return degraded when template service is down', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.checks.templateService.status).toBe('down');
  });

  it('should include queue depths', async () => {
    const result = await controller.check();

    const queues = result.checks.queues;
    expect(queues['q.engine.events.critical']).toBeDefined();
    expect(queues['q.engine.events.critical']).toEqual({
      depth: 3,
      consumers: 4,
    });
  });

  it('should include rule cache info', async () => {
    const result = await controller.check();

    expect(result.checks.ruleCache).toEqual({
      enabled: true,
      ruleCount: 12,
      lastInvalidation: '2026-02-20T09:45:00Z',
    });
  });

  it('should calculate uptime in seconds', async () => {
    const result = await controller.check();
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(typeof result.uptime).toBe('number');
  });
});
