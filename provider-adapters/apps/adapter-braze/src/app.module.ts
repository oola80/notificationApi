import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { BrazeConfigModule } from './config/config.module.js';
import { MetricsModule, LoggingInterceptor } from '@app/common';
import { HealthModule } from './health/health.module.js';
import { HashingModule } from './hashing/hashing.module.js';
import { SendModule } from './send/send.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

@Module({
  imports: [
    BrazeConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          transport:
            config.get<string>('braze.nodeEnv') !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true } }
              : undefined,
          level:
            config.get<string>('braze.nodeEnv') !== 'production'
              ? 'debug'
              : 'info',
        },
      }),
    }),
    MetricsModule,
    HealthModule,
    HashingModule,
    SendModule,
    WebhooksModule,
  ],
  providers: [LoggingInterceptor],
  exports: [LoggingInterceptor],
})
export class AppModule {}
