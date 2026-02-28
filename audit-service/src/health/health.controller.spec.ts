import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let mockDataSource: any;
  let mockRabbitMQHealth: any;
  let mockDlqPendingHealth: any;
  let mockConsumerHealth: any;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    mockRabbitMQHealth = {
      check: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 5, consumers: 9 }),
    };
    mockDlqPendingHealth = {
      check: jest.fn().mockResolvedValue({ status: 'ok', pending: 8 }),
    };
    mockConsumerHealth = {
      check: jest.fn().mockResolvedValue({ status: 'up', connected: true, queueDepths: {} }),
    };

    controller = new HealthController(
      mockDataSource,
      mockRabbitMQHealth,
      mockDlqPendingHealth,
      mockConsumerHealth,
    );
  });

  describe('GET /health', () => {
    it('should return liveness with ok status', () => {
      const result = controller.liveness();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('audit-service');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready when all checks pass', async () => {
      const result = await controller.readiness();

      expect(result.status).toBe('ready');
      expect(result.checks.database.status).toBe('up');
      expect(result.checks.rabbitmq.status).toBe('up');
      expect(result.checks.rabbitmq.consumers).toBe(9);
      expect(result.checks.dlqDepth.status).toBe('ok');
      expect(result.checks.dlqDepth.pending).toBe(8);
      expect(result.checks.consumers.status).toBe('up');
      expect(result.checks.consumers.connected).toBe(true);
    });

    it('should return degraded when database is down', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Connection refused'));

      const result = await controller.readiness();

      expect(result.status).toBe('degraded');
      expect(result.checks.database.status).toBe('down');
    });

    it('should return degraded when RabbitMQ is down', async () => {
      mockRabbitMQHealth.check.mockResolvedValue({ status: 'down', latencyMs: 5001 });

      const result = await controller.readiness();

      expect(result.status).toBe('degraded');
      expect(result.checks.rabbitmq.status).toBe('down');
    });

    it('should return degraded when DLQ check fails', async () => {
      mockDlqPendingHealth.check.mockResolvedValue({ status: 'error', pending: -1 });

      const result = await controller.readiness();

      expect(result.status).toBe('degraded');
      expect(result.checks.dlqDepth.status).toBe('error');
    });

    it('should return degraded when consumer connection is down', async () => {
      mockConsumerHealth.check.mockResolvedValue({ status: 'down', connected: false });

      const result = await controller.readiness();

      expect(result.status).toBe('degraded');
      expect(result.checks.consumers.status).toBe('down');
    });
  });
});
