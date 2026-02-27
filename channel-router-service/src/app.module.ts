import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module.js';
import { CommonModule } from './common/common.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { ChannelsModule } from './channels/channels.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module.js';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module.js';
import { RetryModule } from './retry/retry.module.js';
import { MediaModule } from './media/media.module.js';
import { FallbackModule } from './fallback/fallback.module.js';
import { AppRabbitMQModule } from './rabbitmq/rabbitmq.module.js';
import { HealthMonitorModule } from './health-monitor/health-monitor.module.js';
import { ConsumersModule } from './consumers/consumers.module.js';
import { HealthModule } from './health/health.module.js';

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
        autoLoadEntities: true,
        synchronize: false,
        charset: 'utf8',
      }),
    }),
    CommonModule,
    MetricsModule,
    ChannelsModule,
    ProvidersModule,
    DeliveryModule,
    CircuitBreakerModule,
    RateLimiterModule,
    RetryModule,
    MediaModule,
    FallbackModule,
    AppRabbitMQModule,
    HealthMonitorModule,
    ConsumersModule,
    HealthModule,
  ],
})
export class AppModule {}
