import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { RabbitMQPublisherService } from './rabbitmq-publisher.service.js';
import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_DLQ,
} from './rabbitmq.constants.js';

@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: `amqp://${config.get<string>('rabbitmq.user')}:${config.get<string>('rabbitmq.password')}@${config.get<string>('rabbitmq.host')}:${config.get<number>('rabbitmq.port')}/${encodeURIComponent(config.get<string>('rabbitmq.vhost')!)}`,
        exchanges: [
          {
            name: EXCHANGE_NOTIFICATIONS_STATUS,
            type: 'topic',
          },
          {
            name: EXCHANGE_NOTIFICATIONS_DELIVER,
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
          'channel-critical': {
            prefetchCount: config.get<number>(
              'app.consumerPrefetchCritical',
              5,
            ),
          },
          'channel-normal': {
            prefetchCount: config.get<number>('app.consumerPrefetchNormal', 10),
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
  providers: [RabbitMQPublisherService],
  exports: [RabbitMQModule, RabbitMQPublisherService],
})
export class AppRabbitMQModule {}
