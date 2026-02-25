import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5433', 10),
  name: process.env.DB_NAME ?? 'postgres',
  schema: process.env.DB_SCHEMA ?? 'notification_engine_service',
  user: process.env.DB_USER ?? 'notification_engine_service_user',
  password: process.env.DB_PASSWORD ?? '',
}));
