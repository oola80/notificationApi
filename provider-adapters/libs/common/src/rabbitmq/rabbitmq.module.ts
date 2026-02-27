import { Module, Logger } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { RabbitMQPublisherService } from './rabbitmq-publisher.service.js';
import { EXCHANGE_NOTIFICATIONS_STATUS } from './rabbitmq.constants.js';

@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('rabbitmq.host', 'localhost');
        const port = config.get<number>('rabbitmq.port', 5672);
        const user = config.get<string>('rabbitmq.user', 'notificationapi');
        const password = config.get<string>('rabbitmq.password', '');
        const vhost = config.get<string>(
          'rabbitmq.vhost',
          'vhnotificationapi',
        );

        const logger = new Logger('AppRabbitMQModule');
        logger.log(
          `Connecting to RabbitMQ at ${host}:${port}/${vhost}`,
        );

        return {
          uri: `amqp://${user}:${password}@${host}:${port}/${encodeURIComponent(vhost)}`,
          exchanges: [
            {
              name: EXCHANGE_NOTIFICATIONS_STATUS,
              type: 'topic',
              createExchangeIfNotExists: false,
            },
          ],
          connectionInitOptions: { timeout: 10000, wait: false },
          connectionManagerOptions: {
            heartbeatIntervalInSeconds: 30,
            reconnectTimeInSeconds: 5,
          },
          enableControllerDiscovery: false,
        };
      },
    }),
  ],
  providers: [RabbitMQPublisherService],
  exports: [RabbitMQModule, RabbitMQPublisherService],
})
export class AppRabbitMQModule {}
