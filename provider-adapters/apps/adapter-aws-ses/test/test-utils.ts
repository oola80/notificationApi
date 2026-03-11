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
import { SES_CLIENT } from '../src/ses-client/interfaces/ses.interfaces.js';
import sesConfig from '../src/config/ses.config.js';
import rabbitmqConfig from '../src/config/rabbitmq.config.js';

export function createMockSesClient() {
  return {
    sendEmail: jest.fn().mockResolvedValue({
      messageId: '<test-message-id@us-east-1.amazonses.com>',
    }),
    checkConnectivity: jest.fn().mockResolvedValue({
      ok: true,
      latencyMs: 10,
      details: { mode: 'smtp', smtpHost: 'email-smtp.us-east-1.amazonaws.com' },
    }),
  };
}

export function createMockNodemailerTransporter() {
  return {
    sendMail: jest.fn().mockResolvedValue({
      messageId: '<test-message-id@us-east-1.amazonses.com>',
      envelope: { from: 'noreply@example.com', to: ['user@example.com'] },
    }),
    verify: jest.fn().mockResolvedValue(true),
  };
}

export function createMockSESv2Client() {
  return {
    send: jest.fn().mockResolvedValue({
      MessageId: 'api-test-msg-001',
    }),
  };
}

export async function createTestApp(): Promise<{
  app: INestApplication;
  module: TestingModule;
  mockSesClient: ReturnType<typeof createMockSesClient>;
}> {
  const mockSesClient = createMockSesClient();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [sesConfig, rabbitmqConfig],
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
  })
    .overrideProvider(SES_CLIENT)
    .useValue(mockSesClient)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new DtoValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(loggingInterceptor);

  await app.init();

  return { app, module: moduleFixture, mockSesClient };
}
