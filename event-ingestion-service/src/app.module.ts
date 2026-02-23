import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module.js';
import { CommonModule } from './common/common.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { AppRabbitMQModule } from './rabbitmq/rabbitmq.module.js';
import { EventMappingsModule } from './event-mappings/event-mappings.module.js';
import { EventsModule } from './events/events.module.js';
import { EventSourcesModule } from './event-sources/event-sources.module.js';
import { NormalizationModule } from './normalization/normalization.module.js';
import { MappingCacheModule } from './mapping-cache/mapping-cache.module.js';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module.js';
import { ConsumersModule } from './consumers/consumers.module.js';
import { WebhookModule } from './webhook/webhook.module.js';
import { HealthModule } from './health/health.module.js';
import { EventMapping } from './event-mappings/entities/event-mapping.entity.js';
import { EventSource } from './event-sources/entities/event-source.entity.js';
import { Event } from './events/entities/event.entity.js';

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
        entities: [EventMapping, EventSource, Event],
        synchronize: false,
      }),
    }),
    CommonModule,
    MetricsModule,
    AppRabbitMQModule,
    EventMappingsModule,
    EventsModule,
    EventSourcesModule,
    NormalizationModule,
    MappingCacheModule,
    RateLimiterModule,
    ConsumersModule,
    WebhookModule,
    HealthModule,
  ],
})
export class AppModule {}
