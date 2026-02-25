import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3152', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  ruleCacheEnabled: process.env.RULE_CACHE_ENABLED === 'true',
  preferenceWebhookApiKey: process.env.PREFERENCE_WEBHOOK_API_KEY ?? '',
  templateServiceUrl:
    process.env.TEMPLATE_SERVICE_URL ?? 'http://localhost:3153',
  prefCacheEnabled: (process.env.PREF_CACHE_ENABLED ?? 'true') === 'true',
  prefCacheTtlSeconds: parseInt(
    process.env.PREF_CACHE_TTL_SECONDS ?? '300',
    10,
  ),
  prefCacheMaxSize: parseInt(process.env.PREF_CACHE_MAX_SIZE ?? '50000', 10),
  overrideCacheEnabled:
    (process.env.OVERRIDE_CACHE_ENABLED ?? 'true') === 'true',
  templateServiceCbThreshold: parseInt(
    process.env.TEMPLATE_SERVICE_CB_THRESHOLD ?? '5',
    10,
  ),
  templateServiceCbResetMs: parseInt(
    process.env.TEMPLATE_SERVICE_CB_RESET_MS ?? '60000',
    10,
  ),
}));
