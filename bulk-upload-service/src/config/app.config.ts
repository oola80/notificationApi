import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3158', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  uploadTempDir: process.env.UPLOAD_TEMP_DIR ?? './uploads/temp',
  uploadResultDir: process.env.UPLOAD_RESULT_DIR ?? './uploads/results',
  uploadMaxFileSizeMb: parseInt(
    process.env.UPLOAD_MAX_FILE_SIZE_MB ?? '10',
    10,
  ),
  uploadMaxRows: parseInt(process.env.UPLOAD_MAX_ROWS ?? '5000', 10),
  groupKeyColumn: process.env.GROUP_KEY_COLUMN ?? 'orderId',
  groupItemsPrefix: process.env.GROUP_ITEMS_PREFIX ?? 'item.',
  groupItemsTargetField: process.env.GROUP_ITEMS_TARGET_FIELD ?? 'items',
  groupConflictMode: process.env.GROUP_CONFLICT_MODE ?? 'warn',
  workerBatchSize: parseInt(process.env.WORKER_BATCH_SIZE ?? '50', 10),
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '5', 10),
  workerRateLimit: parseInt(process.env.WORKER_RATE_LIMIT ?? '50', 10),
  workerPollIntervalMs: parseInt(
    process.env.WORKER_POLL_INTERVAL_MS ?? '2000',
    10,
  ),
  workerRequestTimeoutMs: parseInt(
    process.env.WORKER_REQUEST_TIMEOUT_MS ?? '10000',
    10,
  ),
  circuitBreakerThreshold: parseInt(
    process.env.CIRCUIT_BREAKER_THRESHOLD ?? '3',
    10,
  ),
  circuitBreakerCooldownMs: parseInt(
    process.env.CIRCUIT_BREAKER_COOLDOWN_MS ?? '30000',
    10,
  ),
  resultRetentionDays: parseInt(
    process.env.RESULT_RETENTION_DAYS ?? '30',
    10,
  ),
  uploadRetentionDays: parseInt(
    process.env.UPLOAD_RETENTION_DAYS ?? '90',
    10,
  ),
  uploadRateLimitPerHour: parseInt(
    process.env.UPLOAD_RATE_LIMIT_PER_HOUR ?? '10',
    10,
  ),
  eventIngestionUrl:
    process.env.EVENT_INGESTION_URL ?? 'http://localhost:3151',
}));
