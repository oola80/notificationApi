import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3153', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  cacheMaxSize: parseInt(process.env.TEMPLATE_CACHE_MAX_SIZE ?? '1000', 10),
  smsWarnLength: parseInt(process.env.SMS_WARN_LENGTH ?? '160', 10),
  smsMaxLength: parseInt(process.env.SMS_MAX_LENGTH ?? '1600', 10),
  whatsappMaxLength: parseInt(process.env.WHATSAPP_MAX_LENGTH ?? '4096', 10),
  pushMaxLength: parseInt(process.env.PUSH_MAX_LENGTH ?? '256', 10),
  renderTimeoutMs: parseInt(process.env.RENDER_TIMEOUT_MS ?? '5000', 10),
}));
