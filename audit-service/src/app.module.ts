import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module.js';
import { CommonModule } from './common/common.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { EventsModule } from './events/events.module.js';
import { ReceiptsModule } from './receipts/receipts.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { DlqModule } from './dlq/dlq.module.js';
import { SearchModule } from './search/search.module.js';
import { TraceModule } from './trace/trace.module.js';
import { RetentionModule } from './retention/retention.module.js';
import { ConsumersModule } from './consumers/consumers.module.js';
import { HealthModule } from './health/health.module.js';
import { AuditEvent } from './events/entities/audit-event.entity.js';
import { DeliveryReceipt } from './receipts/entities/delivery-receipt.entity.js';
import { NotificationAnalytics } from './analytics/entities/notification-analytics.entity.js';
import { DlqEntry } from './dlq/entities/dlq-entry.entity.js';

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
        entities: [AuditEvent, DeliveryReceipt, NotificationAnalytics, DlqEntry],
        synchronize: false,
        charset: 'utf8',
      }),
    }),
    CommonModule,
    MetricsModule,
    EventsModule,
    ReceiptsModule,
    AnalyticsModule,
    DlqModule,
    SearchModule,
    TraceModule,
    RetentionModule,
    ConsumersModule,
    HealthModule,
  ],
})
export class AppModule {}
