import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3156', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  consumerBatchSize: parseInt(process.env.CONSUMER_BATCH_SIZE ?? '50', 10),
  consumerFlushIntervalMs: parseInt(
    process.env.CONSUMER_FLUSH_INTERVAL_MS ?? '2000',
    10,
  ),
  consumerRetryDelayMs: parseInt(
    process.env.CONSUMER_RETRY_DELAY_MS ?? '5000',
    10,
  ),
  consumerMaxRetries: parseInt(process.env.CONSUMER_MAX_RETRIES ?? '3', 10),
  retentionPayloadDays: parseInt(
    process.env.RETENTION_PAYLOAD_DAYS ?? '90',
    10,
  ),
  retentionMetadataDays: parseInt(
    process.env.RETENTION_METADATA_DAYS ?? '730',
    10,
  ),
  analyticsHourlyCron: process.env.ANALYTICS_HOURLY_CRON ?? '5 * * * *',
  analyticsDailyCron: process.env.ANALYTICS_DAILY_CRON ?? '15 0 * * *',
  searchMaxResults: parseInt(process.env.SEARCH_MAX_RESULTS ?? '200', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
}));
