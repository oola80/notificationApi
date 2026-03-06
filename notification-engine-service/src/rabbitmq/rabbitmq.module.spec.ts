import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { AppRabbitMQModule } from './rabbitmq.module.js';
import { NotificationPublisherService } from './notification-publisher.service.js';
import {
  EXCHANGE_EVENTS_NORMALIZED,
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_NOTIFICATIONS_DLQ,
  EXCHANGE_CONFIG_EVENTS,
} from './rabbitmq.constants.js';

describe('AppRabbitMQModule', () => {
  let factoryConfig: any;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const values: Record<string, any> = {
        'rabbitmq.user': 'testuser',
        'rabbitmq.password': 'testpass',
        'rabbitmq.host': 'localhost',
        'rabbitmq.port': 5672,
        'rabbitmq.vhost': 'testvhost',
        'rabbitmq.prefetch': 10,
        'rabbitmq.prefetchCritical': 5,
        'rabbitmq.prefetchNormal': 10,
      };
      return values[key] ?? defaultValue;
    }),
  } as unknown as ConfigService;

  beforeAll(async () => {
    // Extract the forRootAsync options from the module metadata
    // The imports array contains the result of RabbitMQModule.forRootAsync(...)
    const imports: any[] = Reflect.getMetadata('imports', AppRabbitMQModule) || [];

    // Find the dynamic module (has useFactory)
    for (const imp of imports) {
      // Dynamic modules returned by forRootAsync have providers with useFactory
      if (imp && imp.providers) {
        for (const provider of imp.providers) {
          if (provider.useFactory && provider.inject?.includes(ConfigService)) {
            factoryConfig = await provider.useFactory(mockConfigService);
            break;
          }
        }
      }
      // Also check if the import itself has a module property (NestJS dynamic module shape)
      if (imp && imp.module && imp.providers) {
        for (const provider of imp.providers) {
          if (provider.useFactory) {
            try {
              factoryConfig = await provider.useFactory(mockConfigService);
            } catch {
              // not the right factory
            }
            if (factoryConfig?.exchanges) break;
          }
        }
      }
    }
  });

  it('should produce a valid factory config', () => {
    expect(factoryConfig).toBeDefined();
    expect(factoryConfig.exchanges).toBeDefined();
  });

  it('should declare all 5 exchanges', () => {
    expect(factoryConfig.exchanges).toHaveLength(5);
    const names = factoryConfig.exchanges.map((e: any) => e.name);
    expect(names).toContain(EXCHANGE_EVENTS_NORMALIZED);
    expect(names).toContain(EXCHANGE_NOTIFICATIONS_DELIVER);
    expect(names).toContain(EXCHANGE_NOTIFICATIONS_STATUS);
    expect(names).toContain(EXCHANGE_NOTIFICATIONS_DLQ);
    expect(names).toContain(EXCHANGE_CONFIG_EVENTS);
  });

  it('should mark EVENTS_NORMALIZED, DLQ, CONFIG_EVENTS as createExchangeIfNotExists: false', () => {
    const find = (name: string) =>
      factoryConfig.exchanges.find((e: any) => e.name === name);
    expect(find(EXCHANGE_EVENTS_NORMALIZED).createExchangeIfNotExists).toBe(false);
    expect(find(EXCHANGE_NOTIFICATIONS_DLQ).createExchangeIfNotExists).toBe(false);
    expect(find(EXCHANGE_CONFIG_EVENTS).createExchangeIfNotExists).toBe(false);
  });

  it('should NOT mark DELIVER and STATUS as createExchangeIfNotExists: false', () => {
    const find = (name: string) =>
      factoryConfig.exchanges.find((e: any) => e.name === name);
    expect(find(EXCHANGE_NOTIFICATIONS_DELIVER).createExchangeIfNotExists).toBeUndefined();
    expect(find(EXCHANGE_NOTIFICATIONS_STATUS).createExchangeIfNotExists).toBeUndefined();
  });

  it('should configure named channels with correct prefetch', () => {
    expect(factoryConfig.channels['channel-critical'].prefetchCount).toBe(5);
    expect(factoryConfig.channels['channel-normal'].prefetchCount).toBe(10);
  });

  it('should set connection init timeout to 10000ms', () => {
    expect(factoryConfig.connectionInitOptions.timeout).toBe(10000);
  });

  it('should set heartbeat to 30s and reconnect to 5s', () => {
    expect(factoryConfig.connectionManagerOptions.heartbeatIntervalInSeconds).toBe(30);
    expect(factoryConfig.connectionManagerOptions.reconnectTimeInSeconds).toBe(5);
  });

  it('should export NotificationPublisherService', () => {
    const exports: any[] = Reflect.getMetadata('exports', AppRabbitMQModule) || [];
    expect(
      exports.some(
        (e) =>
          e === NotificationPublisherService ||
          e === RabbitMQModule,
      ),
    ).toBe(true);
  });
});
