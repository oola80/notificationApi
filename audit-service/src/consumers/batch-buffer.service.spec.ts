import { Nack } from '@golevelup/nestjs-rabbitmq';
import { BatchBufferService } from './batch-buffer.service';

describe('BatchBufferService', () => {
  let service: BatchBufferService;
  let mockMetricsService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockMetricsService = {
      observeConsumerBatchDuration: jest.fn(),
      observeConsumerBatchSize: jest.fn(),
      incrementPoisonMessages: jest.fn(),
      incrementDeserializationErrors: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'app.consumerBatchSize': 3,
          'app.consumerFlushIntervalMs': 100,
          'app.consumerRetryDelayMs': 10,
          'app.consumerMaxRetries': 3,
        };
        return config[key] ?? defaultValue;
      }),
    };

    service = new BatchBufferService(mockConfigService, mockMetricsService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('registerFlushHandler', () => {
    it('should register a handler for a queue', () => {
      const handler = jest.fn();
      service.registerFlushHandler('test.queue', handler);
      // No assertion needed — just verifying no error
    });
  });

  describe('add and flush by batch size', () => {
    it('should flush when batch size is reached', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerFlushHandler('test.queue', handler);

      const promises = [
        service.add('test.queue', { id: 1 }),
        service.add('test.queue', { id: 2 }),
        service.add('test.queue', { id: 3 }),
      ];

      const results = await Promise.all(promises);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith([
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ]);
      expect(results).toEqual([undefined, undefined, undefined]);
    });

    it('should ACK all messages on successful flush', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerFlushHandler('test.queue', handler);

      const results = await Promise.all([
        service.add('test.queue', { a: 1 }),
        service.add('test.queue', { a: 2 }),
        service.add('test.queue', { a: 3 }),
      ]);

      for (const result of results) {
        expect(result).toBeUndefined(); // void = ACK
      }
    });
  });

  describe('flush by timer', () => {
    it('should flush when timer interval is reached', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerFlushHandler('test.queue', handler);

      const promise = service.add('test.queue', { timer: true });

      const result = await promise;
      expect(result).toBeUndefined();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith([{ timer: true }]);
    });
  });

  describe('metrics on successful flush', () => {
    it('should record batch duration and size metrics', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerFlushHandler('test.queue', handler);

      await Promise.all([
        service.add('test.queue', { x: 1 }),
        service.add('test.queue', { x: 2 }),
        service.add('test.queue', { x: 3 }),
      ]);

      expect(
        mockMetricsService.observeConsumerBatchDuration,
      ).toHaveBeenCalledWith('test.queue', expect.any(Number));
      expect(
        mockMetricsService.observeConsumerBatchSize,
      ).toHaveBeenCalledWith('test.queue', 3);
    });
  });

  describe('transient error handling', () => {
    it('should NACK+requeue on first transient failure', async () => {
      const error = new Error('Connection refused');
      (error as any).message = 'ECONNREFUSED';
      const handler = jest.fn().mockRejectedValue(error);
      service.registerFlushHandler('test.queue', handler);

      const results = await Promise.all([
        service.add('test.queue', { fail: 1 }),
        service.add('test.queue', { fail: 2 }),
        service.add('test.queue', { fail: 3 }),
      ]);

      for (const result of results) {
        expect(result).toBeInstanceOf(Nack);
      }
    });

    it('should ACK as poison after max retries of transient failures', async () => {
      const error = new Error('ECONNREFUSED');
      const handler = jest.fn().mockRejectedValue(error);
      service.registerFlushHandler('test.queue', handler);

      // Simulate 3 rounds of retries for the same records
      const records = [{ poison: 1 }, { poison: 2 }, { poison: 3 }];

      // First attempt: NACK (retry count 1)
      let results = await Promise.all(
        records.map((r) => service.add('test.queue', r)),
      );
      for (const r of results) {
        expect(r).toBeInstanceOf(Nack);
      }

      // Second attempt: NACK (retry count 2)
      results = await Promise.all(
        records.map((r) => service.add('test.queue', r)),
      );
      for (const r of results) {
        expect(r).toBeInstanceOf(Nack);
      }

      // Third attempt: ACK as poison (retry count 3 >= maxRetries)
      results = await Promise.all(
        records.map((r) => service.add('test.queue', r)),
      );
      for (const r of results) {
        expect(r).toBeUndefined(); // ACK (poison)
      }

      expect(mockMetricsService.incrementPoisonMessages).toHaveBeenCalledWith(
        'test.queue',
      );
    });
  });

  describe('permanent error handling', () => {
    it('should ACK all messages on permanent error', async () => {
      const error = new Error('unique constraint violation');
      (error as any).code = '23505'; // not in transient codes
      const handler = jest.fn().mockRejectedValue(error);
      service.registerFlushHandler('test.queue', handler);

      const results = await Promise.all([
        service.add('test.queue', { perm: 1 }),
        service.add('test.queue', { perm: 2 }),
        service.add('test.queue', { perm: 3 }),
      ]);

      for (const result of results) {
        expect(result).toBeUndefined(); // ACK (discard)
      }
      expect(mockMetricsService.incrementPoisonMessages).toHaveBeenCalledWith(
        'test.queue',
      );
    });
  });

  describe('no flush handler', () => {
    it('should ACK messages if no handler is registered', async () => {
      const promise = service.add('unregistered.queue', { orphan: true });
      // Wait for timer to trigger flush
      const result = await promise;
      expect(result).toBeUndefined();
    });
  });

  describe('isTransientError', () => {
    it('should identify PostgreSQL transient error codes', () => {
      const connError = new Error('connection');
      (connError as any).code = '08006';
      expect(service.isTransientError(connError)).toBe(true);

      const deadlock = new Error('deadlock');
      (deadlock as any).code = '40P01';
      expect(service.isTransientError(deadlock)).toBe(true);
    });

    it('should identify transient errors by message', () => {
      expect(
        service.isTransientError(new Error('Connection refused')),
      ).toBe(true);
      expect(service.isTransientError(new Error('ECONNREFUSED'))).toBe(true);
      expect(service.isTransientError(new Error('timeout'))).toBe(true);
      expect(service.isTransientError(new Error('ECONNRESET'))).toBe(true);
    });

    it('should return false for non-transient errors', () => {
      expect(
        service.isTransientError(new Error('unique constraint')),
      ).toBe(false);
      expect(service.isTransientError(new Error('syntax error'))).toBe(false);
    });
  });

  describe('fingerprint', () => {
    it('should produce consistent fingerprints for identical records', () => {
      const record = { notificationId: 'abc', eventType: 'TEST' };
      expect(service.fingerprint(record)).toBe(service.fingerprint(record));
    });

    it('should produce different fingerprints for different records', () => {
      const a = { id: 1 };
      const b = { id: 2 };
      expect(service.fingerprint(a)).not.toBe(service.fingerprint(b));
    });
  });

  describe('getBufferSize', () => {
    it('should return 0 for empty buffer', () => {
      expect(service.getBufferSize('test.queue')).toBe(0);
    });

    it('should return current buffer size', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerFlushHandler('test.queue', handler);

      // Add one message (below batch size of 3, timer will eventually flush)
      void service.add('test.queue', { data: 1 });
      expect(service.getBufferSize('test.queue')).toBe(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('should flush remaining buffers on shutdown', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerFlushHandler('test.queue', handler);

      // Add messages but don't trigger batch size
      void service.add('test.queue', { shutdown: 1 });
      void service.add('test.queue', { shutdown: 2 });

      await service.onModuleDestroy();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith([
        { shutdown: 1 },
        { shutdown: 2 },
      ]);
    });
  });

  describe('multiple queues', () => {
    it('should maintain separate buffers per queue', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);
      service.registerFlushHandler('queue.a', handler1);
      service.registerFlushHandler('queue.b', handler2);

      await Promise.all([
        service.add('queue.a', { q: 'a', v: 1 }),
        service.add('queue.a', { q: 'a', v: 2 }),
        service.add('queue.a', { q: 'a', v: 3 }),
      ]);

      // queue.a should have flushed (batch size 3)
      expect(handler1).toHaveBeenCalledTimes(1);
      // queue.b should not have flushed
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});
