import { registerAs } from '@nestjs/config';

export default registerAs('whatsapp', () => {
  const apiVersion = process.env.META_API_VERSION ?? 'v22.0';
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID ?? '';

  return {
    port: parseInt(process.env.WHATSAPP_PORT ?? '3173', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    accessToken: process.env.META_ACCESS_TOKEN ?? '',
    phoneNumberId,
    appSecret: process.env.META_APP_SECRET ?? '',
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ?? '',
    apiVersion,
    defaultTemplateLanguage:
      process.env.META_DEFAULT_TEMPLATE_LANGUAGE ?? 'en',
    baseUrl: `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`,
    testMode: process.env.WHATSAPP_TEST_MODE === 'true',
    tlsRejectUnauthorized:
      process.env.WHATSAPP_TLS_REJECT_UNAUTHORIZED !== 'false',
  };
});
