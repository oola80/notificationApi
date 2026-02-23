import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3151', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  dedupWindowHours: parseInt(process.env.DEDUP_WINDOW_HOURS ?? '24', 10),
  mappingCacheEnabled: process.env.MAPPING_CACHE_ENABLED === 'true',
  webhookRateLimit: parseInt(process.env.WEBHOOK_RATE_LIMIT ?? '100', 10),
}));
