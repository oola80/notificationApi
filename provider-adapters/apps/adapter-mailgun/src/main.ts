import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import {
  DtoValidationPipe,
  HttpExceptionFilter,
  LoggingInterceptor,
} from '@app/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new DtoValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(loggingInterceptor);

  app.enableCors();

  const config = app.get(ConfigService);
  const port = config.get<number>('mailgun.port', 3171);

  await app.listen(port);
}
void bootstrap();
