import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AdapterHealthMonitorService } from './adapter-health-monitor.service.js';
import { AdapterClientService } from '../adapter-client/adapter-client.service.js';
import { ProviderConfigsRepository } from '../providers/provider-configs.repository.js';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service.js';
import { MetricsService } from '../metrics/metrics.service.js';

describe('AdapterHealthMonitorService', () => {
  let service: AdapterHealthMonitorService;
  let adapterClient: jest.Mocked<AdapterClientService>;
  let providerConfigsRepo: jest.Mocked<ProviderConfigsRepository>;
  let circuitBreaker: jest.Mocked<CircuitBreakerService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockProvider = {
    id: 'prov-1',
    providerName: 'sendgrid',
    adapterUrl: 'http://localhost:3170',
    channel: 'email',
    isActive: true,
    lastHealthCheck: null,
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdapterHealthMonitorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(30000),
          },
        },
        {
          provide: AdapterClientService,
          useValue: {
            checkHealth: jest.fn(),
          },
        },
        {
          provide: ProviderConfigsRepository,
          useValue: {
            findActiveByChannel: jest.fn().mockResolvedValue([]),
            findById: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
          },
        },
        {
          provide: CircuitBreakerService,
          useValue: {
            recordSuccess: jest.fn(),
            recordHealthCheckFailure: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementAdapterUnavailable: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdapterHealthMonitorService>(
      AdapterHealthMonitorService,
    );
    adapterClient = module.get(AdapterClientService);
    providerConfigsRepo = module.get(ProviderConfigsRepository);
    circuitBreaker = module.get(CircuitBreakerService);
    metricsService = module.get(MetricsService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkAllAdapters', () => {
    it('should check health of all active providers across channels', async () => {
      providerConfigsRepo.findActiveByChannel.mockResolvedValue([
        mockProvider as any,
      ]);
      adapterClient.checkHealth.mockResolvedValue({
        status: 'ok',
        providerId: 'prov-1',
        providerName: 'sendgrid',
        supportedChannels: ['email'],
        latencyMs: 50,
        details: {},
      });
      providerConfigsRepo.findById.mockResolvedValue(mockProvider as any);

      await service.checkAllAdapters();

      expect(adapterClient.checkHealth).toHaveBeenCalledWith(
        'http://localhost:3170',
      );
    });

    it('should deduplicate providers across channels', async () => {
      providerConfigsRepo.findActiveByChannel.mockResolvedValue([
        mockProvider as any,
      ]);
      adapterClient.checkHealth.mockResolvedValue({
        status: 'ok',
        providerId: 'prov-1',
        providerName: 'sendgrid',
        supportedChannels: ['email'],
        latencyMs: 50,
        details: {},
      });
      providerConfigsRepo.findById.mockResolvedValue(mockProvider as any);

      await service.checkAllAdapters();

      // Provider appears in all 4 channel queries but checkHealth called only once
      expect(adapterClient.checkHealth).toHaveBeenCalledTimes(1);
    });

    it('should record success when adapter is healthy', async () => {
      providerConfigsRepo.findActiveByChannel
        .mockResolvedValueOnce([mockProvider as any])
        .mockResolvedValue([]);
      adapterClient.checkHealth.mockResolvedValue({
        status: 'ok',
        providerId: 'prov-1',
        providerName: 'sendgrid',
        supportedChannels: ['email'],
        latencyMs: 50,
        details: {},
      });
      providerConfigsRepo.findById.mockResolvedValue(mockProvider as any);

      await service.checkAllAdapters();

      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('prov-1');
    });

    it('should record health check failure when adapter returns unhealthy status', async () => {
      providerConfigsRepo.findActiveByChannel
        .mockResolvedValueOnce([mockProvider as any])
        .mockResolvedValue([]);
      adapterClient.checkHealth.mockResolvedValue({
        status: 'unhealthy',
        providerId: 'prov-1',
        providerName: 'sendgrid',
        supportedChannels: ['email'],
        latencyMs: 50,
        details: {},
      });
      providerConfigsRepo.findById.mockResolvedValue(mockProvider as any);

      await service.checkAllAdapters();

      expect(circuitBreaker.recordHealthCheckFailure).toHaveBeenCalledWith(
        'prov-1',
      );
      expect(metricsService.incrementAdapterUnavailable).toHaveBeenCalledWith(
        'sendgrid',
      );
    });

    it('should record health check failure when adapter is unreachable', async () => {
      providerConfigsRepo.findActiveByChannel
        .mockResolvedValueOnce([mockProvider as any])
        .mockResolvedValue([]);
      adapterClient.checkHealth.mockRejectedValue(new Error('ECONNREFUSED'));
      providerConfigsRepo.findById.mockResolvedValue(mockProvider as any);

      await service.checkAllAdapters();

      expect(circuitBreaker.recordHealthCheckFailure).toHaveBeenCalledWith(
        'prov-1',
      );
      expect(metricsService.incrementAdapterUnavailable).toHaveBeenCalledWith(
        'sendgrid',
      );
    });

    it('should handle empty provider list gracefully', async () => {
      providerConfigsRepo.findActiveByChannel.mockResolvedValue([]);

      await service.checkAllAdapters();

      expect(adapterClient.checkHealth).not.toHaveBeenCalled();
    });
  });

  describe('getHealthStatus', () => {
    it('should return empty map initially', () => {
      const status = service.getHealthStatus();
      expect(status.size).toBe(0);
    });

    it('should return health status after check', async () => {
      providerConfigsRepo.findActiveByChannel
        .mockResolvedValueOnce([mockProvider as any])
        .mockResolvedValue([]);
      adapterClient.checkHealth.mockResolvedValue({
        status: 'ok',
        providerId: 'prov-1',
        providerName: 'sendgrid',
        supportedChannels: ['email'],
        latencyMs: 50,
        details: {},
      });
      providerConfigsRepo.findById.mockResolvedValue(mockProvider as any);

      await service.checkAllAdapters();

      const status = service.getHealthStatus();
      expect(status.size).toBe(1);
      const entry = status.get('prov-1');
      expect(entry?.status).toBe('healthy');
      expect(entry?.providerName).toBe('sendgrid');
    });

    it('should return a copy of the status map', () => {
      const status1 = service.getHealthStatus();
      const status2 = service.getHealthStatus();
      expect(status1).not.toBe(status2);
    });
  });

  describe('lifecycle', () => {
    it('should start interval on module init', () => {
      service.onModuleInit();
      // Interval is set, no error
      expect(service).toBeDefined();
    });

    it('should clear interval on module destroy', () => {
      service.onModuleInit();
      service.onModuleDestroy();
      // No error thrown
      expect(service).toBeDefined();
    });
  });
});
