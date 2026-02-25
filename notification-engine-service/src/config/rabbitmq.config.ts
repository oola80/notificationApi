import { registerAs } from '@nestjs/config';

export default registerAs('rabbitmq', () => ({
  host: process.env.RABBITMQ_HOST ?? 'localhost',
  port: parseInt(process.env.RABBITMQ_PORT ?? '5672', 10),
  managementUrl:
    process.env.RABBITMQ_MANAGEMENT_URL ?? 'http://localhost:15672',
  vhost: process.env.RABBITMQ_VHOST ?? 'vhnotificationapi',
  user: process.env.RABBITMQ_USER ?? 'notificationapi',
  password: process.env.RABBITMQ_PASSWORD ?? '',
  prefetch: parseInt(process.env.RABBITMQ_PREFETCH ?? '10', 10),
  dlqMaxRetries: parseInt(process.env.DLQ_MAX_RETRIES ?? '3', 10),
  retryInitialDelayMs: parseInt(
    process.env.RETRY_INITIAL_DELAY_MS ?? '1000',
    10,
  ),
  retryBackoffMultiplier: parseFloat(
    process.env.RETRY_BACKOFF_MULTIPLIER ?? '2',
  ),
  retryMaxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS ?? '30000', 10),
  prefetchCritical: parseInt(process.env.RABBITMQ_PREFETCH_CRITICAL ?? '5', 10),
  prefetchNormal: parseInt(process.env.RABBITMQ_PREFETCH_NORMAL ?? '10', 10),
}));
