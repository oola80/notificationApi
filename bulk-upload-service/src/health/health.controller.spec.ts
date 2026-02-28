import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  let mockDataSource: any;
  let mockRabbitMQHealth: any;
  let mockEventIngestionHealth: any;
  let mockDiskSpaceHealth: any;

  beforeEach(() => {
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
    controller = new HealthController(
      mockDataSource,
      mockRabbitMQHealth,
      mockEventIngestionHealth,
      mockDiskSpaceHealth,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('liveness (GET /health)', () => {
    it('should return ok when DB is up', async () => {
      const result = await controller.liveness();
      expect(result.status).toBe('ok');
      expect(result.info.database.status).toBe('up');
      expect(result.error).toEqual({});
    });

    it('should return error when DB is down', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Connection refused'));
      const result = await controller.liveness();
      expect(result.status).toBe('error');
      expect(result.error.database.status).toBe('down');
    });
  });

  describe('readiness (GET /ready)', () => {
    it('should return ok when all checks pass', async () => {
      const result = await controller.readiness();
      expect(result.status).toBe('ok');
      expect(result.info.database.status).toBe('up');
      expect(result.info.rabbitmq.status).toBe('up');
      expect(result.info.eventIngestion.status).toBe('up');
      expect(result.info.diskSpace.status).toBe('up');
      expect(result.error).toEqual({});
    });

    it('should return error when RabbitMQ is down', async () => {
      mockRabbitMQHealth.check.mockResolvedValue({
        status: 'down',
        latencyMs: 5001,
      });
      const result = await controller.readiness();
      expect(result.status).toBe('error');
      expect(result.info.database.status).toBe('up');
      expect(result.error.rabbitmq.status).toBe('down');
    });

    it('should return error when Event Ingestion is down', async () => {
      mockEventIngestionHealth.check.mockResolvedValue({
        status: 'down',
        latencyMs: 5001,
      });
      const result = await controller.readiness();
      expect(result.status).toBe('error');
      expect(result.error.eventIngestion.status).toBe('down');
    });

    it('should return error when disk space is low', async () => {
      mockDiskSpaceHealth.check.mockResolvedValue({
        status: 'down',
        free: '50.0 MB',
      });
      const result = await controller.readiness();
      expect(result.status).toBe('error');
      expect(result.error.diskSpace.status).toBe('down');
    });

    it('should check all indicators in parallel', async () => {
      await controller.readiness();
      expect(mockRabbitMQHealth.check).toHaveBeenCalled();
      expect(mockEventIngestionHealth.check).toHaveBeenCalled();
      expect(mockDiskSpaceHealth.check).toHaveBeenCalled();
    });
  });
});
