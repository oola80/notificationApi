import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { NotificationPublisherService } from './notification-publisher.service.js';
import {
  EXCHANGE_EVENTS_NORMALIZED,
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_NOTIFICATIONS_DLQ,
  EXCHANGE_CONFIG_EVENTS,
} from './rabbitmq.constants.js';

@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: `amqp://${config.get<string>('rabbitmq.user')}:${config.get<string>('rabbitmq.password')}@${config.get<string>('rabbitmq.host')}:${config.get<number>('rabbitmq.port')}/${encodeURIComponent(config.get<string>('rabbitmq.vhost')!)}`,
        exchanges: [
          {
            name: EXCHANGE_EVENTS_NORMALIZED,
            type: 'topic',
            createExchangeIfNotExists: false,
          },
          {
            name: EXCHANGE_NOTIFICATIONS_DELIVER,
            type: 'topic',
          },
          {
            name: EXCHANGE_NOTIFICATIONS_STATUS,
            type: 'topic',
          },
          {
            name: EXCHANGE_NOTIFICATIONS_DLQ,
            type: 'topic',
            createExchangeIfNotExists: false,
          },
          {
            name: EXCHANGE_CONFIG_EVENTS,
            type: 'topic',
            createExchangeIfNotExists: false,
          },
        ],
        prefetchCount: config.get<number>('rabbitmq.prefetch'),
        channels: {
          'channel-critical': {
            prefetchCount: config.get<number>('rabbitmq.prefetchCritical', 5),
          },
          'channel-normal': {
            prefetchCount: config.get<number>('rabbitmq.prefetchNormal', 10),
          },
        },
        connectionInitOptions: { timeout: 10000 },
        connectionManagerOptions: {
          heartbeatIntervalInSeconds: 30,
          reconnectTimeInSeconds: 5,
        },
        enableControllerDiscovery: true,
      }),
    }),
  ],
  providers: [NotificationPublisherService],
  exports: [RabbitMQModule, NotificationPublisherService],
})
export class AppRabbitMQModule {}
