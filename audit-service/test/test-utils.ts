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
    findWithFilters: jest.fn(async () => ({
      data: Array.from(events.values()),
      total: events.size,
      page: 1,
      limit: 50,
    })),
    fullTextSearch: jest.fn(async () => ({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    })),
    findByNotificationIdOrdered: jest.fn(async () => []),
    findDistinctNotificationIds: jest.fn(async () => []),
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
    findByNotificationIdOrdered: jest.fn(async () => []),
    findByNotificationId: jest.fn(async () => []),
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
    findWithFilters: jest.fn(async () => ({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    })),
    findForSummary: jest.fn(async () => []),
    upsertRow: jest.fn(async () => undefined),
    aggregateFromReceipts: jest.fn(async () => []),
    countSuppressed: jest.fn(async () => ({})),
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
    findWithFilters: jest.fn(async () => ({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    })),
    statusCounts: jest.fn(async () => ({
      pending: 0,
      investigated: 0,
      reprocessed: 0,
      discarded: 0,
    })),
    countPending: jest.fn(async () => 0),
    updateEntry: jest.fn(async () => undefined),
  };
}

export function createMockDlqPublisher() {
  return {
    republish: jest.fn(async () => undefined),
  };
}
