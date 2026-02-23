import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import {
  EXCHANGE_EVENTS_INCOMING,
  EXCHANGE_EVENTS_NORMALIZED,
  EXCHANGE_NOTIFICATIONS_DLQ,
  EXCHANGE_CONFIG_EVENTS,
} from './rabbitmq.constants.js';
import { EventPublisherService } from './event-publisher.service.js';

@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: `amqp://${config.get<string>('rabbitmq.user')}:${config.get<string>('rabbitmq.password')}@${config.get<string>('rabbitmq.host')}:${config.get<number>('rabbitmq.port')}/${encodeURIComponent(config.get<string>('rabbitmq.vhost')!)}`,
        prefetchCount: config.get<number>('rabbitmq.prefetch'),
        exchanges: [
          { name: EXCHANGE_EVENTS_INCOMING, type: 'topic' },
          { name: EXCHANGE_EVENTS_NORMALIZED, type: 'topic' },
          { name: EXCHANGE_NOTIFICATIONS_DLQ, type: 'fanout' },
          { name: EXCHANGE_CONFIG_EVENTS, type: 'topic' },
        ],
        connectionInitOptions: { wait: true, timeout: 10000 },
        connectionManagerOptions: {
          heartbeatIntervalInSeconds: 30,
          reconnectTimeInSeconds: 5,
        },
        enableControllerDiscovery: true,
      }),
    }),
  ],
  providers: [EventPublisherService],
  exports: [RabbitMQModule, EventPublisherService],
})
export class AppRabbitMQModule {}
