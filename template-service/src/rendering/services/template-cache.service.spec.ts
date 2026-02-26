import { TemplateCacheService, CompiledTemplate } from './template-cache.service.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import { ConfigService } from '@nestjs/config';
import Handlebars from 'handlebars';

describe('TemplateCacheService', () => {
  let service: TemplateCacheService;
  let metricsService: jest.Mocked<MetricsService>;
  let configService: jest.Mocked<ConfigService>;

  const mockCompiled: CompiledTemplate = {
    subjectFn: Handlebars.compile('Subject {{name}}'),
    bodyFn: Handlebars.compile('Body {{name}}'),
  };

  beforeEach(() => {
    metricsService = {
      incrementCacheHit: jest.fn(),
      incrementCacheMiss: jest.fn(),
      setCacheSize: jest.fn(),
      incrementCacheEviction: jest.fn(),
    } as any;

    configService = {
      get: jest.fn().mockReturnValue(3),
    } as any;

    service = new TemplateCacheService(configService, metricsService);
  });

  it('should return undefined on cache miss', () => {
    const result = service.get('nonexistent:key:email');
    expect(result).toBeUndefined();
    expect(metricsService.incrementCacheMiss).toHaveBeenCalledWith('email');
  });

  it('should return compiled template on cache hit', () => {
    service.set('t1:v1:email', mockCompiled);
    const result = service.get('t1:v1:email');
    expect(result).toBe(mockCompiled);
    expect(metricsService.incrementCacheHit).toHaveBeenCalledWith('email');
  });

  it('should increment hit metrics on hit', () => {
    service.set('t1:v1:sms', mockCompiled);
    service.get('t1:v1:sms');
    expect(metricsService.incrementCacheHit).toHaveBeenCalledWith('sms');
  });

  it('should increment miss metrics on miss', () => {
    service.get('miss:key:push');
    expect(metricsService.incrementCacheMiss).toHaveBeenCalledWith('push');
  });

  it('should invalidate all entries for a templateId', () => {
    service.set('t1:v1:email', mockCompiled);
    service.set('t1:v1:sms', mockCompiled);
    service.set('t2:v1:email', mockCompiled);

    service.invalidate('t1');

    expect(service.get('t1:v1:email')).toBeUndefined();
    expect(service.get('t1:v1:sms')).toBeUndefined();
    expect(service.get('t2:v1:email')).toBeDefined();
  });

  it('should clear everything on invalidateAll', () => {
    service.set('t1:v1:email', mockCompiled);
    service.set('t2:v1:sms', mockCompiled);

    service.invalidateAll();

    expect(service.getStats().size).toBe(0);
    expect(metricsService.setCacheSize).toHaveBeenCalledWith(0);
  });

  it('should evict oldest entry when maxSize is reached', () => {
    service.set('t1:v1:email', mockCompiled);
    service.set('t2:v1:email', mockCompiled);
    service.set('t3:v1:email', mockCompiled);

    // maxSize is 3, adding a 4th should evict t1
    service.set('t4:v1:email', mockCompiled);

    expect(service.get('t1:v1:email')).toBeUndefined();
    expect(service.get('t4:v1:email')).toBeDefined();
    expect(service.getStats().size).toBe(3);
  });

  it('should increment cache eviction metric on eviction', () => {
    service.set('t1:v1:email', mockCompiled);
    service.set('t2:v1:email', mockCompiled);
    service.set('t3:v1:email', mockCompiled);

    metricsService.incrementCacheEviction.mockClear();

    // maxSize is 3, adding a 4th should evict and increment metric
    service.set('t4:v1:email', mockCompiled);

    expect(metricsService.incrementCacheEviction).toHaveBeenCalledTimes(1);
  });

  it('should return correct stats', () => {
    service.set('t1:v1:email', mockCompiled);
    service.set('t2:v1:sms', mockCompiled);

    const stats = service.getStats();
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(3);
  });

  it('should update setCacheSize metric on set', () => {
    service.set('t1:v1:email', mockCompiled);
    expect(metricsService.setCacheSize).toHaveBeenCalledWith(1);
  });

  it('should update setCacheSize metric on invalidate', () => {
    service.set('t1:v1:email', mockCompiled);
    service.set('t2:v1:email', mockCompiled);
    metricsService.setCacheSize.mockClear();

    service.invalidate('t1');
    expect(metricsService.setCacheSize).toHaveBeenCalledWith(1);
  });

  it('should update setCacheSize metric on invalidateAll', () => {
    service.set('t1:v1:email', mockCompiled);
    metricsService.setCacheSize.mockClear();

    service.invalidateAll();
    expect(metricsService.setCacheSize).toHaveBeenCalledWith(0);
  });

  it('should not duplicate insertion order when overwriting existing key', () => {
    const compiled2: CompiledTemplate = {
      subjectFn: null,
      bodyFn: Handlebars.compile('Updated body'),
    };

    service.set('t1:v1:email', mockCompiled);
    service.set('t1:v1:email', compiled2);

    expect(service.getStats().size).toBe(1);
    expect(service.get('t1:v1:email')).toBe(compiled2);
  });
});
