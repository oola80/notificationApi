import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5433', 10),
  name: process.env.DB_NAME ?? 'postgres',
  schema: process.env.DB_SCHEMA ?? 'template_service',
  user: process.env.DB_USER ?? 'template_service_user',
  password: process.env.DB_PASSWORD ?? '',
}));
