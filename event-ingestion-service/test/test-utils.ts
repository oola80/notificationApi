import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DtoValidationPipe } from '../src/common/pipes/dto-validation.pipe.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

export const E2E_SOURCE_NAME = 'e2e-test-source';
export const E2E_EVENT_TYPE = 'e2e.test.event';
const SCHEMA = 'event_ingestion_service';

export async function createTestApp(): Promise<{
  app: INestApplication;
  module: TestingModule;
}> {
  const { AppModule } = await import('../src/app.module.js');

  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(new DtoValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });
  await app.init();

  return { app, module };
}

export async function cleanupTestData(
  dataSource: DataSource,
  table: string,
  where: string,
  params: any[],
): Promise<void> {
  try {
    await dataSource.query(
      `DELETE FROM ${SCHEMA}.${table} WHERE ${where}`,
      params,
    );
  } catch {
    // Ignore cleanup errors
  }
}

export async function seedEventSource(
  dataSource: DataSource,
  data: {
    name: string;
    displayName: string;
    type: string;
    isActive: boolean;
    rateLimit?: number | null;
  },
): Promise<any> {
  const result = await dataSource.query(
    `INSERT INTO ${SCHEMA}.event_sources (name, display_name, type, is_active, rate_limit)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.name,
      data.displayName,
      data.type,
      data.isActive,
      data.rateLimit ?? null,
    ],
  );
  return result[0];
}

export async function seedEventMapping(
  dataSource: DataSource,
  data: {
    sourceId: string;
    eventType: string;
    name: string;
    fieldMappings: Record<string, any>;
    priority?: string;
  },
): Promise<any> {
  const result = await dataSource.query(
    `INSERT INTO ${SCHEMA}.event_mappings (source_id, event_type, name, field_mappings, priority)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.sourceId,
      data.eventType,
      data.name,
      JSON.stringify(data.fieldMappings),
      data.priority ?? 'normal',
    ],
  );
  return result[0];
}
