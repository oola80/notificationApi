import { ConsumerHealthIndicator } from './consumer-health.indicator';

describe('ConsumerHealthIndicator', () => {
  let indicator: ConsumerHealthIndicator;
  let mockAmqpConnection: any;
  let mockConfigService: any;
  let mockMetricsService: any;

  beforeEach(() => {
    mockAmqpConnection = {
      managedChannel: {},
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'rabbitmq.managementUrl': 'http://localhost:15672',
          'rabbitmq.vhost': 'vhnotificationapi',
          'rabbitmq.user': 'notificationapi',
          'rabbitmq.password': 'test',
        };
        return config[key] ?? defaultValue;
      }),
    };

    mockMetricsService = {
      setConsumerLag: jest.fn(),
    };

    indicator = new ConsumerHealthIndicator(
      mockAmqpConnection,
      mockConfigService,
      mockMetricsService,
    );
  });

  describe('check', () => {
    it('should return up when AmqpConnection has a managed channel', async () => {
      // fetchQueueDepths will fail due to no actual HTTP server, but connection check passes
      const result = await indicator.check();
      expect(result.status).toBe('up');
      expect(result.connected).toBe(true);
    });

    it('should return down when AmqpConnection has no managed channel', async () => {
      mockAmqpConnection.managedChannel = null;

      const result = await indicator.check();
      expect(result.status).toBe('down');
      expect(result.connected).toBe(false);
    });

    it('should return down when AmqpConnection throws', async () => {
      Object.defineProperty(mockAmqpConnection, 'managedChannel', {
        get: () => {
          throw new Error('no connection');
        },
      });

      const result = await indicator.check();
      expect(result.status).toBe('down');
      expect(result.connected).toBe(false);
    });

    it('should handle null AmqpConnection gracefully', async () => {
      indicator = new ConsumerHealthIndicator(
        null as any,
        mockConfigService,
        mockMetricsService,
      );

      const result = await indicator.check();
      expect(result.status).toBe('down');
      expect(result.connected).toBe(false);
    });
  });
});
