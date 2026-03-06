import { AppModule } from './app.module.js';

describe('AppModule', () => {
  it('should have expected number of imports', () => {
    const imports = Reflect.getMetadata('imports', AppModule);
    expect(imports).toBeDefined();
    expect(imports.length).toBe(15);
  });

  it('should include key modules', () => {
    const imports = Reflect.getMetadata('imports', AppModule);
    const importNames = imports.map((imp: any) => {
      if (typeof imp === 'function') return imp.name;
      if (typeof imp === 'object' && imp?.module) return imp.module.name;
      return String(imp);
    });

    const expectedModules = [
      'CommonModule',
      'MetricsModule',
      'AppRabbitMQModule',
      'EventMappingsModule',
      'EventsModule',
      'EventSourcesModule',
      'NormalizationModule',
      'MappingCacheModule',
      'RateLimiterModule',
      'ConsumersModule',
      'WebhookModule',
      'HealthModule',
    ];

    for (const moduleName of expectedModules) {
      expect(importNames).toContain(moduleName);
    }
  });
});
