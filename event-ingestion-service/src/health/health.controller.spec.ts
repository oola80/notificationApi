import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';
import { RabbitMQHealthIndicator } from './rabbitmq.health-indicator.js';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: jest.Mocked<HealthCheckService>;

  beforeEach(async () => {
    const mockHealthCheckService = {
      check: jest.fn(),
    };
    const mockTypeOrmHealthIndicator = {
      pingCheck: jest.fn(),
    };
    const mockRabbitMQHealthIndicator = {
      isHealthy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        {
          provide: TypeOrmHealthIndicator,
          useValue: mockTypeOrmHealthIndicator,
        },
        {
          provide: RabbitMQHealthIndicator,
          useValue: mockRabbitMQHealthIndicator,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get(HealthCheckService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return healthy status when all services are up', async () => {
    const healthResult: HealthCheckResult = {
      status: 'ok',
      info: {
        database: { status: 'up' },
        rabbitmq: { status: 'up', connected: true },
      },
      error: {},
      details: {
        database: { status: 'up' },
        rabbitmq: { status: 'up', connected: true },
      },
    };
    healthCheckService.check.mockResolvedValue(healthResult);

    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.info).toEqual({
      database: { status: 'up' },
      rabbitmq: { status: 'up', connected: true },
    });
  });

  it('should report unhealthy when database is down', async () => {
    const healthResult: HealthCheckResult = {
      status: 'error',
      info: {},
      error: { database: { status: 'down' } },
      details: { database: { status: 'down' } },
    };
    healthCheckService.check.mockResolvedValue(healthResult);

    const result = await controller.check();
    expect(result.status).toBe('error');
    expect(result.error).toEqual({ database: { status: 'down' } });
  });

  it('should include both database and rabbitmq in health check', async () => {
    healthCheckService.check.mockImplementation(async (indicators) => {
      // Verify two health indicators are passed
      expect(indicators).toHaveLength(2);
      return {
        status: 'ok',
        info: {},
        error: {},
        details: {},
      };
    });

    await controller.check();
    expect(healthCheckService.check).toHaveBeenCalledTimes(1);
  });
});
