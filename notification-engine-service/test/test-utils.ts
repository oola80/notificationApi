import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { DtoValidationPipe } from '../src/common/pipes/dto-validation.pipe.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor.js';
import { DataSource } from 'typeorm';

export async function createTestApp(): Promise<{
  app: INestApplication;
  module: TestingModule;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new DtoValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(loggingInterceptor);

  await app.init();

  return { app, module: moduleFixture };
}

export async function cleanupTestData(
  dataSource: DataSource,
  table: string,
  where: string,
  params: any[] = [],
): Promise<void> {
  try {
    await dataSource.query(`DELETE FROM ${table} WHERE ${where}`, params);
  } catch {
    // Ignore cleanup errors
  }
}
