import { registerAs } from '@nestjs/config';

export default registerAs('ses', () => {
  const region = process.env.SES_REGION ?? 'us-east-1';
  const smtpHost = `email-smtp.${region}.amazonaws.com`;

  return {
    port: parseInt(process.env.ADAPTER_PORT ?? '3174', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    mode: process.env.SES_MODE ?? 'smtp',
    region,
    smtpHost,
    smtpPort: parseInt(process.env.SES_SMTP_PORT ?? '587', 10),
    smtpUsername: process.env.SES_SMTP_USERNAME ?? '',
    smtpPassword: process.env.SES_SMTP_PASSWORD ?? '',
    fromEmail: process.env.SES_FROM_EMAIL ?? '',
    fromName: process.env.SES_FROM_NAME ?? '',
    timeoutMs: parseInt(process.env.SES_TIMEOUT_MS ?? '10000', 10),
    accessKeyId: process.env.SES_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY ?? '',
    configurationSet: process.env.SES_CONFIGURATION_SET ?? '',
  };
});
