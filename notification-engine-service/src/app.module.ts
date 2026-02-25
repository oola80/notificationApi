import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module.js';
import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';
import { RulesModule } from './rules/rules.module.js';
import { RecipientsModule } from './recipients/recipients.module.js';
import { PreferencesModule } from './preferences/preferences.module.js';
import { OverridesModule } from './overrides/overrides.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { AppRabbitMQModule } from './rabbitmq/rabbitmq.module.js';
import { TemplateClientModule } from './template-client/template-client.module.js';
import { ConsumersModule } from './consumers/consumers.module.js';
import { MetricsModule } from './metrics/metrics.module.js';

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
        entities: [],
        autoLoadEntities: true,
        synchronize: false,
        charset: 'utf8',
      }),
    }),
    CommonModule,
    MetricsModule,
    HealthModule,
    RulesModule,
    PreferencesModule,
    OverridesModule,
    RecipientsModule,
    NotificationsModule,
    AppRabbitMQModule,
    TemplateClientModule,
    ConsumersModule,
  ],
})
export class AppModule {}
