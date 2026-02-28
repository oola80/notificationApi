import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DtoValidationPipe } from '../src/common/pipes/dto-validation.pipe';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

export async function createTestApp(
  moduleOverrides: any,
): Promise<INestApplication> {
  const moduleFixture: TestingModule =
    await Test.createTestingModule(moduleOverrides).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new DtoValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  // LoggingInterceptor requires PinoLogger DI — skip in E2E tests
  await app.init();
  return app;
}

export function createMockMetricsService() {
  return {
    registry: {
      metrics: jest
        .fn()
        .mockResolvedValue('# HELP audit_events_ingested_total\n'),
    },
    incrementEventsIngested: jest.fn(),
    incrementReceiptsIngested: jest.fn(),
    incrementOrphanedReceipts: jest.fn(),
    incrementDlqEntries: jest.fn(),
    incrementDeserializationErrors: jest.fn(),
    incrementPoisonMessages: jest.fn(),
    observeConsumerBatchDuration: jest.fn(),
    observeConsumerBatchSize: jest.fn(),
    observeTraceDuration: jest.fn(),
    observeSearchDuration: jest.fn(),
    observeAggregationDuration: jest.fn(),
    setConsumerLag: jest.fn(),
    setDbPoolActive: jest.fn(),
    setDbPoolIdle: jest.fn(),
    setDlqPendingCount: jest.fn(),
    onModuleInit: jest.fn(),
  };
}

export function createMockAuditEventsRepository() {
  const events = new Map<string, any>();
  return {
    findById: jest.fn(async (id: string) => events.get(id) ?? null),
    findWithPagination: jest.fn(async () => ({
      data: Array.from(events.values()),
      page: 1,
      limit: 50,
      total: events.size,
    })),
    _events: events,
    _reset: () => events.clear(),
  };
}

export function createMockDeliveryReceiptsRepository() {
  return {
    findById: jest.fn(async () => null),
    findWithPagination: jest.fn(async () => ({
      data: [],
      page: 1,
      limit: 50,
      total: 0,
    })),
  };
}

export function createMockNotificationAnalyticsRepository() {
  return {
    findById: jest.fn(async () => null),
    findWithPagination: jest.fn(async () => ({
      data: [],
      page: 1,
      limit: 50,
      total: 0,
    })),
  };
}

export function createMockDlqEntriesRepository() {
  return {
    findById: jest.fn(async () => null),
    findWithPagination: jest.fn(async () => ({
      data: [],
      page: 1,
      limit: 50,
      total: 0,
    })),
    countPending: jest.fn(async () => 0),
  };
}
