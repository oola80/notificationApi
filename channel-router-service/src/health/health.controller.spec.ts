import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller.js';
import { AdapterHealthMonitorService } from '../health-monitor/adapter-health-monitor.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSource: { query: jest.Mock };
  let adapterHealthMonitor: jest.Mocked<AdapterHealthMonitorService>;

  beforeEach(async () => {
    dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

    // Mock global fetch for RabbitMQ management check
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DataSource, useValue: dataSource },
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
        {
          provide: AdapterHealthMonitorService,
          useValue: {
            getHealthStatus: jest.fn().mockReturnValue(new Map()),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    adapterHealthMonitor = module.get(AdapterHealthMonitorService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /health (liveness)', () => {
    it('should return status ok', () => {
      const result = controller.liveness();
      expect(result.status).toBe('ok');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include uptime in seconds', () => {
      const result = controller.liveness();
      expect(typeof result.uptime).toBe('number');
    });
  });

  describe('GET /ready (readiness)', () => {
    it('should return ready when all checks pass', async () => {
      const result = await controller.readiness();

      expect(result.status).toBe('ready');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.checks.database.status).toBe('up');
      expect(result.checks.rabbitmq.status).toBe('up');
    });

    it('should return not_ready when database is down', async () => {
      dataSource.query.mockRejectedValue(new Error('Connection refused'));

      const result = await controller.readiness();

      expect(result.status).toBe('not_ready');
      expect(result.checks.database.status).toBe('down');
    });

    it('should return not_ready when RabbitMQ is down', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await controller.readiness();

      expect(result.status).toBe('not_ready');
      expect(result.checks.rabbitmq.status).toBe('down');
    });

    it('should report database latency', async () => {
      const result = await controller.readiness();

      expect(result.checks.database).toHaveProperty('latencyMs');
      expect(typeof result.checks.database.latencyMs).toBe('number');
    });

    it('should report RabbitMQ latency', async () => {
      const result = await controller.readiness();

      expect(result.checks.rabbitmq).toHaveProperty('latencyMs');
      expect(typeof result.checks.rabbitmq.latencyMs).toBe('number');
    });

    it('should handle RabbitMQ non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      const result = await controller.readiness();

      expect(result.checks.rabbitmq.status).toBe('down');
    });

    it('should include adapter health in readiness', async () => {
      const result = await controller.readiness();

      expect(result.checks.adapters).toBeDefined();
      expect(result.checks.adapters.total).toBe(0);
      expect(result.checks.adapters.providers).toEqual([]);
    });

    it('should be ready with no adapters registered', async () => {
      const result = await controller.readiness();

      expect(result.status).toBe('ready');
      expect(result.checks.adapters.total).toBe(0);
    });

    it('should include adapter provider details', async () => {
      const statusMap = new Map();
      statusMap.set('prov-1', {
        providerId: 'prov-1',
        providerName: 'sendgrid',
        adapterUrl: 'http://localhost:3170',
        status: 'healthy',
        lastCheckAt: '2026-01-01T00:00:00.000Z',
      });
      adapterHealthMonitor.getHealthStatus.mockReturnValue(statusMap);

      const result = await controller.readiness();

      expect(result.checks.adapters.total).toBe(1);
      expect(result.checks.adapters.healthy).toBe(1);
      expect(result.checks.adapters.unhealthy).toBe(0);
      expect(result.checks.adapters.providers[0].providerName).toBe('sendgrid');
    });

    it('should be not_ready when all adapters unhealthy', async () => {
      const statusMap = new Map();
      statusMap.set('prov-1', {
        providerId: 'prov-1',
        providerName: 'sendgrid',
        adapterUrl: 'http://localhost:3170',
        status: 'unhealthy',
        lastCheckAt: '2026-01-01T00:00:00.000Z',
      });
      adapterHealthMonitor.getHealthStatus.mockReturnValue(statusMap);

      const result = await controller.readiness();

      expect(result.status).toBe('not_ready');
      expect(result.checks.adapters.unhealthy).toBe(1);
    });
  });
});
