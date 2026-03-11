import { registerAs } from '@nestjs/config';

export default registerAs('rabbitmq', () => ({
  host: process.env.RABBITMQ_HOST ?? 'localhost',
  port: parseInt(process.env.RABBITMQ_PORT ?? '5672', 10),
  vhost: process.env.RABBITMQ_VHOST ?? 'vhnotificationapi',
  user: process.env.RABBITMQ_USER ?? 'notificationapi',
  password: process.env.RABBITMQ_PASSWORD ?? '',
}));
