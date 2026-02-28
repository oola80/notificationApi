import { RabbitMQHealthIndicator } from './rabbitmq-health.indicator';

describe('RabbitMQHealthIndicator', () => {
  let indicator: RabbitMQHealthIndicator;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const values: Record<string, any> = {
          'rabbitmq.managementUrl': 'http://localhost:15672',
          'rabbitmq.vhost': 'vhnotificationapi',
          'rabbitmq.user': 'notificationapi',
          'rabbitmq.password': 'password',
        };
        return values[key] ?? defaultValue;
      }),
    };
    indicator = new RabbitMQHealthIndicator(mockConfig);
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  it('should return down when fetch fails', async () => {
    // fetch to localhost:15672 will fail in test environment
    const result = await indicator.check();
    expect(result.status).toBe('down');
    expect(result.latencyMs).toBeDefined();
  });
});
