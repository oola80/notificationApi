import { Module, Logger } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { EXCHANGE_NOTIFICATIONS_STATUS } from './rabbitmq.constants.js';
import { AuditPublisherService } from './audit-publisher.service.js';

@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('AppRabbitMQModule');
        const host = config.get<string>('rabbitmq.host', 'localhost');
        const port = config.get<number>('rabbitmq.port', 5672);
        const vhost = config.get<string>(
          'rabbitmq.vhost',
          'vhnotificationapi',
        );
        const user = config.get<string>('rabbitmq.user', 'notificationapi');
        const password = config.get<string>('rabbitmq.password', '');

        logger.log(
          `Connecting to RabbitMQ at ${host}:${port}/${vhost} as ${user}`,
        );

        return {
          uri: `amqp://${user}:${password}@${host}:${port}/${encodeURIComponent(vhost)}`,
          exchanges: [
            {
              name: EXCHANGE_NOTIFICATIONS_STATUS,
              type: 'topic',
            },
          ],
          connectionInitOptions: { wait: true, timeout: 10000 },
          connectionManagerOptions: {
            heartbeatIntervalInSeconds: 30,
            reconnectTimeInSeconds: 5,
          },
          enableControllerDiscovery: false,
        };
      },
    }),
  ],
  providers: [AuditPublisherService],
  exports: [RabbitMQModule, AuditPublisherService],
})
export class AppRabbitMQModule {}
