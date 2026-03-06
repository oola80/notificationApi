import 'reflect-metadata';
import { AppModule } from './app.module.js';
import { AppConfigModule } from './config/config.module.js';
import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';
import { RulesModule } from './rules/rules.module.js';
import { RecipientsModule } from './recipients/recipients.module.js';
import { PreferencesModule } from './preferences/preferences.module.js';
import { OverridesModule } from './overrides/overrides.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { AppRabbitMQModule } from './rabbitmq/rabbitmq.module.js';
import { TemplateClientModule } from './template-client/template-client.module.js';
import { ConsumersModule } from './consumers/consumers.module.js';
import { MetricsModule } from './metrics/metrics.module.js';

describe('AppModule', () => {
  it('should be defined', () => {
    expect(AppModule).toBeDefined();
  });

  it('should have imports metadata', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports.length).toBeGreaterThanOrEqual(13);
  });

  it('should import AppConfigModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(AppConfigModule);
  });

  it('should import CommonModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(CommonModule);
  });

  it('should import MetricsModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(MetricsModule);
  });

  it('should import HealthModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(HealthModule);
  });

  it('should import RulesModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(RulesModule);
  });

  it('should import PreferencesModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(PreferencesModule);
  });

  it('should import OverridesModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(OverridesModule);
  });

  it('should import RecipientsModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(RecipientsModule);
  });

  it('should import NotificationsModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(NotificationsModule);
  });

  it('should import AppRabbitMQModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(AppRabbitMQModule);
  });

  it('should import TemplateClientModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(TemplateClientModule);
  });

  it('should import ConsumersModule', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    expect(imports).toContain(ConsumersModule);
  });

  it('should import LoggerModule (dynamic)', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    // LoggerModule.forRootAsync returns a dynamic module object with a `module` property
    const loggerImport = imports.find(
      (imp) => imp?.module?.name === 'LoggerModule',
    );
    expect(loggerImport).toBeDefined();
  });

  it('should import TypeOrmModule (dynamic)', () => {
    const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
    // TypeOrmModule.forRootAsync returns a dynamic module — check for TypeOrm in module name
    const typeormImport = imports.find(
      (imp) =>
        imp?.module?.name?.includes('TypeOrm') ||
        imp?.module?.name?.includes('Typeorm'),
    );
    expect(typeormImport).toBeDefined();
  });
});
