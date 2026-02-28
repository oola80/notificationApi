import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have a registry', () => {
    expect(service.registry).toBeDefined();
  });

  describe('counters', () => {
    it('should have uploadsTotal counter', () => {
      expect(service.uploadsTotal).toBeDefined();
    });

    it('should have uploadRowsTotal counter', () => {
      expect(service.uploadRowsTotal).toBeDefined();
    });

    it('should increment uploadsTotal', () => {
      expect(() => service.incrementUploads('queued')).not.toThrow();
      expect(() => service.incrementUploads('completed')).not.toThrow();
    });

    it('should increment uploadRowsTotal', () => {
      expect(() => service.incrementRows('succeeded')).not.toThrow();
      expect(() => service.incrementRows('failed')).not.toThrow();
    });
  });

  describe('histograms', () => {
    it('should have uploadFileSizeBytes histogram', () => {
      expect(service.uploadFileSizeBytes).toBeDefined();
    });

    it('should have uploadDurationSeconds histogram', () => {
      expect(service.uploadDurationSeconds).toBeDefined();
    });

    it('should observe file size', () => {
      expect(() => service.observeFileSize(1048576)).not.toThrow();
    });

    it('should observe duration', () => {
      expect(() => service.observeDuration(10.5)).not.toThrow();
    });
  });

  describe('gauges', () => {
    it('should have activeUploads gauge', () => {
      expect(service.activeUploads).toBeDefined();
    });

    it('should set active uploads count', () => {
      expect(() => service.setActiveUploads(3)).not.toThrow();
    });
  });

  describe('phase 3 metrics', () => {
    it('should have circuitBreakerState gauge', () => {
      expect(service.circuitBreakerState).toBeDefined();
    });

    it('should have circuitBreakerTripsTotal counter', () => {
      expect(service.circuitBreakerTripsTotal).toBeDefined();
    });

    it('should have rateLimiterWaitSeconds histogram', () => {
      expect(service.rateLimiterWaitSeconds).toBeDefined();
    });

    it('should have groupSize histogram', () => {
      expect(service.groupSize).toBeDefined();
    });

    it('should have retryTotal counter', () => {
      expect(service.retryTotal).toBeDefined();
    });

    it('should set circuit breaker state', () => {
      expect(() => service.setCircuitBreakerState(0)).not.toThrow();
      expect(() => service.setCircuitBreakerState(1)).not.toThrow();
      expect(() => service.setCircuitBreakerState(2)).not.toThrow();
    });

    it('should increment circuit breaker trips', () => {
      expect(() => service.incrementCircuitBreakerTrips()).not.toThrow();
    });

    it('should observe rate limiter wait', () => {
      expect(() => service.observeRateLimiterWait(0.5)).not.toThrow();
    });

    it('should observe group size', () => {
      expect(() => service.observeGroupSize(5)).not.toThrow();
    });

    it('should increment retry', () => {
      expect(() => service.incrementRetry()).not.toThrow();
    });
  });

  describe('onModuleInit', () => {
    it('should collect default metrics', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  describe('registry metrics', () => {
    it('should return metrics string', async () => {
      service.onModuleInit();
      const metrics = await service.registry.metrics();
      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('bus_uploads_total');
      expect(metrics).toContain('bus_upload_rows_total');
      expect(metrics).toContain('bus_upload_file_size_bytes');
      expect(metrics).toContain('bus_upload_duration_seconds');
      expect(metrics).toContain('bus_active_uploads');
      expect(metrics).toContain('bus_circuit_breaker_state');
      expect(metrics).toContain('bus_circuit_breaker_trips_total');
      expect(metrics).toContain('bus_rate_limiter_wait_seconds');
      expect(metrics).toContain('bus_group_size');
      expect(metrics).toContain('bus_retry_total');
    });
  });
});
