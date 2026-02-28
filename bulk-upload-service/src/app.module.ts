import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module.js';
import { CommonModule } from './common/common.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { ParsingModule } from './parsing/parsing.module.js';
import { EventIngestionModule } from './event-ingestion/event-ingestion.module.js';
import { ResultsModule } from './results/results.module.js';
import { ProcessingModule } from './processing/processing.module.js';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module.js';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module.js';
import { AppRabbitMQModule } from './rabbitmq/rabbitmq.module.js';
import { HealthModule } from './health/health.module.js';
import { Upload } from './uploads/entities/upload.entity.js';
import { UploadRow } from './uploads/entities/upload-row.entity.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          transport:
            config.get<string>('app.nodeEnv') !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true } }
              : undefined,
          level:
            config.get<string>('app.nodeEnv') !== 'production'
              ? 'debug'
              : 'info',
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        database: config.get<string>('database.name'),
        schema: config.get<string>('database.schema'),
        username: config.get<string>('database.user'),
        password: config.get<string>('database.password'),
        entities: [Upload, UploadRow],
        synchronize: false,
        charset: 'utf8',
      }),
    }),
    CommonModule,
    MetricsModule,
    UploadsModule,
    ParsingModule,
    EventIngestionModule,
    ResultsModule,
    ProcessingModule,
    CircuitBreakerModule,
    RateLimiterModule,
    AppRabbitMQModule,
    HealthModule,
  ],
})
export class AppModule {}
