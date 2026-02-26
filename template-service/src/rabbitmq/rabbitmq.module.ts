import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { AuditPublisherService } from './audit-publisher.service.js';
import { EXCHANGE_NOTIFICATIONS_STATUS } from './rabbitmq.constants.js';

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
            createExchangeIfNotExists: false,
          },
        ],
        connectionInitOptions: { timeout: 10000 },
        connectionManagerOptions: {
          heartbeatIntervalInSeconds: 30,
          reconnectTimeInSeconds: 5,
        },
        enableControllerDiscovery: false,
      }),
    }),
  ],
  providers: [AuditPublisherService],
  exports: [RabbitMQModule, AuditPublisherService],
})
export class AppRabbitMQModule {}
