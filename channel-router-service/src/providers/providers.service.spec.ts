import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ProvidersService } from './providers.service.js';
import { ProviderConfigsRepository } from './provider-configs.repository.js';
import { ProviderCacheService } from './provider-cache.service.js';
import { AdapterClientService } from '../adapter-client/adapter-client.service.js';
import { ProviderConfig } from './entities/provider-config.entity.js';

describe('ProvidersService', () => {
  let service: ProvidersService;
  let repo: {
    findById: jest.Mock;
    findByAdapterUrl: jest.Mock;
    findActiveByChannel: jest.Mock;
    findAllProviders: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let cacheService: {
    invalidate: jest.Mock;
    isEnabled: jest.Mock;
    getActiveProvidersByChannel: jest.Mock;
  };
  let adapterClient: {
    getCapabilities: jest.Mock;
    checkHealth: jest.Mock;
    send: jest.Mock;
  };

  const mockProvider: Partial<ProviderConfig> = {
    id: '11111111-1111-1111-1111-111111111111',
    providerName: 'SendGrid',
    providerId: 'sendgrid',
    channel: 'email',
    adapterUrl: 'http://adapter-sendgrid:3170',
    isActive: true,
    routingWeight: 100,
    circuitBreakerState: 'CLOSED',
    rateLimitTokensPerSec: 100,
    rateLimitMaxBurst: 200,
    lastHealthCheck: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repo = {
      findById: jest.fn(),
      findByAdapterUrl: jest.fn(),
      findActiveByChannel: jest.fn(),
      findAllProviders: jest.fn(),
      create: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    cacheService = {
      invalidate: jest.fn().mockResolvedValue(undefined),
      isEnabled: jest.fn().mockReturnValue(true),
      getActiveProvidersByChannel: jest.fn().mockReturnValue([]),
    };

    adapterClient = {
      getCapabilities: jest.fn(),
      checkHealth: jest.fn(),
      send: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvidersService,
        { provide: ProviderConfigsRepository, useValue: repo },
        { provide: ProviderCacheService, useValue: cacheService },
        { provide: AdapterClientService, useValue: adapterClient },
      ],
    }).compile();

    service = module.get<ProvidersService>(ProvidersService);
  });

  describe('register', () => {
    const registerDto = {
      providerName: 'SendGrid',
      providerId: 'sendgrid',
      channel: 'email',
      adapterUrl: 'http://adapter-sendgrid:3170',
      isActive: true,
      routingWeight: 100,
      rateLimitTokensPerSec: 100,
      rateLimitMaxBurst: 200,
    };

    it('should register a new provider with capabilities', async () => {
      repo.findByAdapterUrl.mockResolvedValue(null);
      adapterClient.getCapabilities.mockResolvedValue({
        providerId: 'sendgrid',
        providerName: 'SendGrid',
        supportedChannels: ['email'],
        supportsAttachments: true,
        supportsMediaUrls: false,
        maxAttachmentSizeMb: 30,
        maxRecipientsPerRequest: 1,
        webhookPath: '/webhooks/inbound',
      });
      adapterClient.checkHealth.mockResolvedValue({ status: 'ok' });
      repo.create.mockResolvedValue({ ...mockProvider });

      const result = await service.register(registerDto);

      expect(result.providerName).toBe('SendGrid');
      expect(repo.create).toHaveBeenCalled();
      expect(cacheService.invalidate).toHaveBeenCalled();
    });

    it('should register even if capabilities check fails', async () => {
      repo.findByAdapterUrl.mockResolvedValue(null);
      adapterClient.getCapabilities.mockRejectedValue(
        new Error('connection refused'),
      );
      adapterClient.checkHealth.mockRejectedValue(
        new Error('connection refused'),
      );
      repo.create.mockResolvedValue({ ...mockProvider, configJson: null });

      const result = await service.register(registerDto);

      expect(result).toBeDefined();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ configJson: null }),
      );
    });

    it('should throw CRS-020 if adapter URL already registered', async () => {
      repo.findByAdapterUrl.mockResolvedValue(mockProvider);

      await expect(service.register(registerDto)).rejects.toThrow(
        HttpException,
      );

      try {
        await service.register(registerDto);
      } catch (error: any) {
        expect(error.getResponse().code).toBe('CRS-020');
      }
    });
  });

  describe('deregister', () => {
    it('should remove provider and invalidate cache', async () => {
      repo.findById.mockResolvedValue({ ...mockProvider });

      await service.deregister(mockProvider.id!);

      expect(repo.remove).toHaveBeenCalledWith(mockProvider.id);
      expect(cacheService.invalidate).toHaveBeenCalled();
    });

    it('should throw CRS-009 if provider not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.deregister('nonexistent')).rejects.toThrow(
        HttpException,
      );

      try {
        await service.deregister('nonexistent');
      } catch (error: any) {
        expect(error.getResponse().code).toBe('CRS-009');
      }
    });
  });

  describe('findAll', () => {
    it('should return all providers', async () => {
      repo.findAllProviders.mockResolvedValue([mockProvider]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(repo.findAllProviders).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return provider by id', async () => {
      repo.findById.mockResolvedValue(mockProvider);

      const result = await service.findById(mockProvider.id!);

      expect(result.providerName).toBe('SendGrid');
    });

    it('should throw CRS-009 if not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('updateConfig', () => {
    it('should update provider config fields', async () => {
      repo.findById.mockResolvedValue({ ...mockProvider });

      const result = await service.updateConfig(mockProvider.id!, {
        routingWeight: 80,
        isActive: false,
      });

      expect(result.routingWeight).toBe(80);
      expect(result.isActive).toBe(false);
      expect(cacheService.invalidate).toHaveBeenCalled();
    });

    it('should update adapter URL if unique', async () => {
      repo.findById.mockResolvedValue({ ...mockProvider });
      repo.findByAdapterUrl.mockResolvedValue(null);

      const result = await service.updateConfig(mockProvider.id!, {
        adapterUrl: 'http://new-adapter:3170',
      });

      expect(result.adapterUrl).toBe('http://new-adapter:3170');
    });

    it('should allow updating to the same adapter URL', async () => {
      repo.findById.mockResolvedValue({ ...mockProvider });
      repo.findByAdapterUrl.mockResolvedValue(mockProvider);

      const result = await service.updateConfig(mockProvider.id!, {
        adapterUrl: mockProvider.adapterUrl!,
      });

      expect(result.adapterUrl).toBe(mockProvider.adapterUrl);
    });

    it('should throw CRS-020 if new adapter URL is already registered by another provider', async () => {
      repo.findById.mockResolvedValue({ ...mockProvider });
      repo.findByAdapterUrl.mockResolvedValue({
        ...mockProvider,
        id: 'other-id',
      });

      await expect(
        service.updateConfig(mockProvider.id!, {
          adapterUrl: 'http://duplicate:3170',
        }),
      ).rejects.toThrow(HttpException);

      try {
        await service.updateConfig(mockProvider.id!, {
          adapterUrl: 'http://duplicate:3170',
        });
      } catch (error: any) {
        expect(error.getResponse().code).toBe('CRS-020');
      }
    });

    it('should throw CRS-009 if provider not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.updateConfig('nonexistent', { routingWeight: 50 }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getCapabilities', () => {
    it('should proxy capabilities from adapter', async () => {
      repo.findById.mockResolvedValue(mockProvider);

      const capabilities = {
        providerId: 'sendgrid',
        providerName: 'SendGrid',
        supportedChannels: ['email'],
        supportsAttachments: true,
        supportsMediaUrls: false,
        maxAttachmentSizeMb: 30,
        maxRecipientsPerRequest: 1,
        webhookPath: '/webhooks/inbound',
      };

      adapterClient.getCapabilities.mockResolvedValue(capabilities);

      const result = await service.getCapabilities(mockProvider.id!);

      expect(result).toEqual(capabilities);
      expect(adapterClient.getCapabilities).toHaveBeenCalledWith(
        mockProvider.adapterUrl,
      );
    });

    it('should throw CRS-002 if adapter unreachable', async () => {
      repo.findById.mockResolvedValue(mockProvider);
      adapterClient.getCapabilities.mockRejectedValue(
        new Error('connection refused'),
      );

      await expect(service.getCapabilities(mockProvider.id!)).rejects.toThrow(
        HttpException,
      );

      try {
        await service.getCapabilities(mockProvider.id!);
      } catch (error: any) {
        expect(error.getResponse().code).toBe('CRS-002');
      }
    });
  });

  describe('getHealth', () => {
    it('should proxy health from adapter and update lastHealthCheck', async () => {
      repo.findById.mockResolvedValue({ ...mockProvider });

      const health = {
        status: 'ok',
        providerId: 'sendgrid',
        providerName: 'SendGrid',
        supportedChannels: ['email'],
        latencyMs: 45,
        details: { apiReachable: true },
      };

      adapterClient.checkHealth.mockResolvedValue(health);

      const result = await service.getHealth(mockProvider.id!);

      expect(result).toEqual(health);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          lastHealthCheck: expect.any(Date),
        }),
      );
    });

    it('should throw CRS-013 if health check fails', async () => {
      repo.findById.mockResolvedValue(mockProvider);
      adapterClient.checkHealth.mockRejectedValue(
        new Error('connection refused'),
      );

      await expect(service.getHealth(mockProvider.id!)).rejects.toThrow(
        HttpException,
      );

      try {
        await service.getHealth(mockProvider.id!);
      } catch (error: any) {
        expect(error.getResponse().code).toBe('CRS-013');
      }
    });
  });

  describe('findActiveByChannel', () => {
    it('should return cached providers when cache is enabled and has data', async () => {
      const cached = [mockProvider as ProviderConfig];
      cacheService.isEnabled.mockReturnValue(true);
      cacheService.getActiveProvidersByChannel.mockReturnValue(cached);

      const result = await service.findActiveByChannel('email');

      expect(result).toEqual(cached);
      expect(repo.findActiveByChannel).not.toHaveBeenCalled();
    });

    it('should fallback to repository when cache returns empty', async () => {
      cacheService.isEnabled.mockReturnValue(true);
      cacheService.getActiveProvidersByChannel.mockReturnValue([]);
      repo.findActiveByChannel.mockResolvedValue([mockProvider]);

      const result = await service.findActiveByChannel('email');

      expect(result).toHaveLength(1);
      expect(repo.findActiveByChannel).toHaveBeenCalledWith('email');
    });

    it('should use repository directly when cache is disabled', async () => {
      cacheService.isEnabled.mockReturnValue(false);
      repo.findActiveByChannel.mockResolvedValue([mockProvider]);

      const result = await service.findActiveByChannel('email');

      expect(result).toHaveLength(1);
      expect(cacheService.getActiveProvidersByChannel).not.toHaveBeenCalled();
    });
  });
});
