import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3154', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  providerCacheEnabled: process.env.PROVIDER_CACHE_ENABLED === 'true',
  providerCacheTtlSeconds: parseInt(
    process.env.PROVIDER_CACHE_TTL_SECONDS ?? '300',
    10,
  ),
  adapterHttpTimeoutMs: parseInt(
    process.env.ADAPTER_HTTP_TIMEOUT_MS ?? '10000',
    10,
  ),
  adapterHealthCheckIntervalMs: parseInt(
    process.env.ADAPTER_HEALTH_CHECK_INTERVAL_MS ?? '30000',
    10,
  ),
  cbFailureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD ?? '5', 10),
  cbFailureWindowMs: parseInt(process.env.CB_FAILURE_WINDOW_MS ?? '60000', 10),
  cbCooldownMs: parseInt(process.env.CB_COOLDOWN_MS ?? '30000', 10),
  cbHalfOpenMaxAttempts: parseInt(
    process.env.CB_HALF_OPEN_MAX_ATTEMPTS ?? '1',
    10,
  ),
  cbSuccessThreshold: parseInt(process.env.CB_SUCCESS_THRESHOLD ?? '2', 10),
  retryEmailMax: parseInt(process.env.RETRY_EMAIL_MAX ?? '5', 10),
  retrySmsMax: parseInt(process.env.RETRY_SMS_MAX ?? '3', 10),
  retryWhatsappMax: parseInt(process.env.RETRY_WHATSAPP_MAX ?? '4', 10),
  retryPushMax: parseInt(process.env.RETRY_PUSH_MAX ?? '4', 10),
  retryBackoffMultiplier: parseFloat(
    process.env.RETRY_BACKOFF_MULTIPLIER ?? '2',
  ),
  retryJitterFactor: parseFloat(process.env.RETRY_JITTER_FACTOR ?? '0.2'),
  mediaDownloadTimeoutMs: parseInt(
    process.env.MEDIA_DOWNLOAD_TIMEOUT_MS ?? '10000',
    10,
  ),
  mediaMaxFileSizeMb: parseInt(process.env.MEDIA_MAX_FILE_SIZE_MB ?? '10', 10),
  mediaMaxTotalSizeMb: parseInt(
    process.env.MEDIA_MAX_TOTAL_SIZE_MB ?? '30',
    10,
  ),
  consumerPrefetchCritical: parseInt(
    process.env.CONSUMER_PREFETCH_CRITICAL ?? '5',
    10,
  ),
  consumerPrefetchNormal: parseInt(
    process.env.CONSUMER_PREFETCH_NORMAL ?? '10',
    10,
  ),
}));
