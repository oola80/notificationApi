import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import {
  DtoValidationPipe,
  HttpExceptionFilter,
  LoggingInterceptor,
  MetricsModule,
} from '@app/common';
import { HealthModule } from '../src/health/health.module.js';
import { SendModule } from '../src/send/send.module.js';
import { WebhooksModule } from '../src/webhooks/webhooks.module.js';
import mailgunConfig from '../src/config/mailgun.config.js';
import rabbitmqConfig from '../src/config/rabbitmq.config.js';

export async function createTestApp(): Promise<{
  app: INestApplication;
  module: TestingModule;
}> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [mailgunConfig, rabbitmqConfig],
      }),
      LoggerModule.forRoot({
        pinoHttp: { level: 'silent' },
      }),
      MetricsModule,
      HealthModule,
      SendModule,
      WebhooksModule,
    ],
    providers: [LoggingInterceptor],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new DtoValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(loggingInterceptor);

  await app.init();

  return { app, module: moduleFixture };
}
