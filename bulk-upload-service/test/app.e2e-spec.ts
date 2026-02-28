import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  createMockMetricsService,
  createMockAuditPublisher,
} from './test-utils';
import { HealthController } from '../src/health/health.controller';
import { MetricsController } from '../src/metrics/metrics.controller';
import { MetricsService } from '../src/metrics/metrics.service';
import { RabbitMQHealthIndicator } from '../src/health/indicators/rabbitmq-health.indicator';
import { EventIngestionHealthIndicator } from '../src/health/indicators/event-ingestion-health.indicator';
import { DiskSpaceHealthIndicator } from '../src/health/indicators/disk-space-health.indicator';
import { DataSource } from 'typeorm';

describe('App E2E (health + metrics)', () => {
  let app: INestApplication<App>;
  let mockDataSource: any;
  let mockRabbitMQHealth: any;
  let mockEventIngestionHealth: any;
  let mockDiskSpaceHealth: any;

  beforeAll(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    mockRabbitMQHealth = {
      check: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 5 }),
    };
    mockEventIngestionHealth = {
      check: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 10 }),
    };
    mockDiskSpaceHealth = {
      check: jest.fn().mockResolvedValue({ status: 'up', free: '2.1 GB' }),
    };

    const metricsService = new MetricsService();

    app = await createTestApp({
      controllers: [HealthController, MetricsController],
      providers: [
        { provide: DataSource, useValue: mockDataSource },
        { provide: RabbitMQHealthIndicator, useValue: mockRabbitMQHealth },
        {
          provide: EventIngestionHealthIndicator,
          useValue: mockEventIngestionHealth,
        },
        { provide: DiskSpaceHealthIndicator, useValue: mockDiskSpaceHealth },
        { provide: MetricsService, useValue: metricsService },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return 200 with ok status when DB is up', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(body.status).toBe('ok');
      expect(body.info.database.status).toBe('up');
      expect(body.error).toEqual({});
    });

    it('should return 200 with error status when DB is down', async () => {
      mockDataSource.query.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      const { body } = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(body.status).toBe('error');
      expect(body.error.database.status).toBe('down');
    });
  });

  describe('GET /ready', () => {
    it('should return 200 with all checks passing', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/ready')
        .expect(200);

      expect(body.status).toBe('ok');
      expect(body.info.database.status).toBe('up');
      expect(body.info.rabbitmq.status).toBe('up');
      expect(body.info.eventIngestion.status).toBe('up');
      expect(body.info.diskSpace.status).toBe('up');
      expect(body.info.diskSpace.free).toBe('2.1 GB');
    });

    it('should return error status when RabbitMQ is down', async () => {
      mockRabbitMQHealth.check.mockResolvedValueOnce({
        status: 'down',
        latencyMs: 5001,
      });

      const { body } = await request(app.getHttpServer())
        .get('/ready')
        .expect(200);

      expect(body.status).toBe('error');
      expect(body.error.rabbitmq.status).toBe('down');
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus metrics in text format', async () => {
      const response = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('bus_uploads_total');
    });
  });
});
