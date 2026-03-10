import { registerAs } from '@nestjs/config';

export default registerAs('braze', () => ({
  port: parseInt(process.env.BRAZE_PORT ?? '3172', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  apiKey: process.env.BRAZE_API_KEY ?? '',
  restEndpoint: process.env.BRAZE_REST_ENDPOINT ?? '',
  appId: process.env.BRAZE_APP_ID ?? '',
  webhookKey: process.env.BRAZE_WEBHOOK_KEY ?? '',
  fromEmail: process.env.BRAZE_FROM_EMAIL ?? '',
  fromName: process.env.BRAZE_FROM_NAME ?? 'Notifications',
  smsSubscriptionGroup: process.env.BRAZE_SMS_SUBSCRIPTION_GROUP ?? '',
  whatsappSubscriptionGroup:
    process.env.BRAZE_WHATSAPP_SUBSCRIPTION_GROUP ?? '',
  profileSyncEnabled:
    (process.env.BRAZE_PROFILE_SYNC_ENABLED ?? 'false') === 'true',
  profileCacheTtlSeconds: parseInt(
    process.env.BRAZE_PROFILE_CACHE_TTL_SECONDS ?? '300',
    10,
  ),
  timeoutMs: parseInt(process.env.BRAZE_TIMEOUT_MS ?? '10000', 10),
  emailHashPepper: process.env.EMAIL_HASH_PEPPER ?? '',
  pepperCacheTtl: parseInt(process.env.PEPPER_CACHE_TTL ?? '86400', 10),
}));
