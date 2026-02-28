import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, createMockMetricsService } from './test-utils';
import { HealthController } from '../src/health/health.controller';
import { MetricsController } from '../src/metrics/metrics.controller';
import { MetricsService } from '../src/metrics/metrics.service';
import { RabbitMQHealthIndicator } from '../src/health/indicators/rabbitmq-health.indicator';
import { DlqPendingHealthIndicator } from '../src/health/indicators/dlq-pending-health.indicator';
import { ConsumerHealthIndicator } from '../src/health/indicators/consumer-health.indicator';
import { DataSource } from 'typeorm';

describe('App E2E (health + metrics)', () => {
  let app: INestApplication<App>;
  let mockDataSource: any;
  let mockRabbitMQHealth: any;
  let mockDlqPendingHealth: any;
  let mockConsumerHealth: any;

  beforeAll(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    mockRabbitMQHealth = {
      check: jest
        .fn()
        .mockResolvedValue({ status: 'up', latencyMs: 5, consumers: 9 }),
    };
    mockDlqPendingHealth = {
      check: jest.fn().mockResolvedValue({ status: 'ok', pending: 8 }),
    };
    mockConsumerHealth = {
      check: jest.fn().mockResolvedValue({ status: 'up', connected: true, queueDepths: {} }),
    };

    const metricsService = new MetricsService();

    app = await createTestApp({
      controllers: [HealthController, MetricsController],
      providers: [
        { provide: DataSource, useValue: mockDataSource },
        { provide: RabbitMQHealthIndicator, useValue: mockRabbitMQHealth },
        { provide: DlqPendingHealthIndicator, useValue: mockDlqPendingHealth },
        { provide: ConsumerHealthIndicator, useValue: mockConsumerHealth },
        { provide: MetricsService, useValue: metricsService },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return 200 with ok status and service name', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(body.status).toBe('ok');
      expect(body.service).toBe('audit-service');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 with ready status when all checks pass', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(body.status).toBe('ready');
      expect(body.checks.database.status).toBe('up');
      expect(body.checks.rabbitmq.status).toBe('up');
      expect(body.checks.rabbitmq.consumers).toBe(9);
      expect(body.checks.dlqDepth.status).toBe('ok');
      expect(body.checks.dlqDepth.pending).toBe(8);
    });

    it('should return degraded when database is down', async () => {
      mockDataSource.query.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      const { body } = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(body.status).toBe('degraded');
      expect(body.checks.database.status).toBe('down');
    });

    it('should return degraded when RabbitMQ is down', async () => {
      mockRabbitMQHealth.check.mockResolvedValueOnce({
        status: 'down',
        latencyMs: 5001,
      });

      const { body } = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(body.status).toBe('degraded');
      expect(body.checks.rabbitmq.status).toBe('down');
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus metrics in text format', async () => {
      const response = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('audit_events_ingested_total');
    });
  });
});
