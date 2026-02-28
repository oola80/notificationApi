import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import {
  EXCHANGE_EVENTS_NORMALIZED,
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_NOTIFICATIONS_DLQ,
  CHANNEL_EVENTS,
  CHANNEL_DELIVER,
  CHANNEL_STATUS,
  CHANNEL_TEMPLATE,
  CHANNEL_DLQ,
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
            createExchangeIfNotExists: false,
          },
          {
            name: EXCHANGE_NOTIFICATIONS_STATUS,
            type: 'topic',
            createExchangeIfNotExists: false,
          },
          {
            name: EXCHANGE_NOTIFICATIONS_DLQ,
            type: 'fanout',
            createExchangeIfNotExists: false,
          },
        ],
        channels: {
          [CHANNEL_EVENTS]: { prefetchCount: 20 },
          [CHANNEL_DELIVER]: { prefetchCount: 20 },
          [CHANNEL_STATUS]: { prefetchCount: 15 },
          [CHANNEL_TEMPLATE]: { prefetchCount: 10 },
          [CHANNEL_DLQ]: { prefetchCount: 5 },
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
  exports: [RabbitMQModule],
})
export class AppRabbitMQModule {}
