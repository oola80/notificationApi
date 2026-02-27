import { registerAs } from '@nestjs/config';

export default registerAs('mailgun', () => {
  const region = process.env.MAILGUN_REGION ?? 'us';
  const baseUrl =
    region === 'eu'
      ? 'https://api.eu.mailgun.net/v3'
      : 'https://api.mailgun.net/v3';

  return {
    port: parseInt(process.env.MAILGUN_PORT ?? '3171', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    apiKey: process.env.MAILGUN_API_KEY ?? '',
    domain: process.env.MAILGUN_DOMAIN ?? 'distelsa.info',
    fromAddress:
      process.env.MAILGUN_FROM_ADDRESS ?? 'notifications@distelsa.info',
    region,
    baseUrl,
    webhookSigningKey: process.env.MAILGUN_WEBHOOK_SIGNING_KEY ?? '',
  };
});
