import { Test, TestingModule } from '@nestjs/testing';
import { ProvidersController } from './providers.controller.js';
import { ProvidersService } from './providers.service.js';

describe('ProvidersController', () => {
  let controller: ProvidersController;
  let service: {
    register: jest.Mock;
    deregister: jest.Mock;
    findAll: jest.Mock;
    updateConfig: jest.Mock;
    getCapabilities: jest.Mock;
    getHealth: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      register: jest.fn(),
      deregister: jest.fn(),
      findAll: jest.fn(),
      updateConfig: jest.fn(),
      getCapabilities: jest.fn(),
      getHealth: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProvidersController],
      providers: [{ provide: ProvidersService, useValue: service }],
    }).compile();

    controller = module.get<ProvidersController>(ProvidersController);
  });

  describe('POST /providers/register', () => {
    it('should delegate to service.register', async () => {
      const dto = {
        providerName: 'SendGrid',
        providerId: 'sendgrid',
        channel: 'email',
        adapterUrl: 'http://adapter-sendgrid:3170',
      };
      const registered = { id: 'uuid-1', ...dto, isActive: true };

      service.register.mockResolvedValue(registered);

      const result = await controller.register(dto as any);

      expect(result).toEqual(registered);
      expect(service.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('DELETE /providers/:id', () => {
    it('should delegate to service.deregister', async () => {
      service.deregister.mockResolvedValue(undefined);

      await controller.deregister('uuid-1');

      expect(service.deregister).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('GET /providers', () => {
    it('should return all providers', async () => {
      const providers = [
        {
          id: 'uuid-1',
          providerName: 'SendGrid',
          providerId: 'sendgrid',
          channel: 'email',
        },
      ];

      service.findAll.mockResolvedValue(providers);

      const result = await controller.findAll();

      expect(result).toEqual(providers);
    });
  });

  describe('PUT /providers/:id/config', () => {
    it('should delegate to service.updateConfig', async () => {
      const dto = { routingWeight: 80, isActive: true };
      const updated = { id: 'uuid-1', ...dto };

      service.updateConfig.mockResolvedValue(updated);

      const result = await controller.updateConfig('uuid-1', dto as any);

      expect(result).toEqual(updated);
      expect(service.updateConfig).toHaveBeenCalledWith('uuid-1', dto);
    });
  });

  describe('GET /providers/:id/capabilities', () => {
    it('should return adapter capabilities', async () => {
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

      service.getCapabilities.mockResolvedValue(capabilities);

      const result = await controller.getCapabilities('uuid-1');

      expect(result).toEqual(capabilities);
      expect(service.getCapabilities).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('GET /providers/:id/health', () => {
    it('should return adapter health', async () => {
      const health = {
        status: 'ok',
        providerId: 'sendgrid',
        providerName: 'SendGrid',
        supportedChannels: ['email'],
        latencyMs: 45,
        details: { apiReachable: true },
      };

      service.getHealth.mockResolvedValue(health);

      const result = await controller.getHealth('uuid-1');

      expect(result).toEqual(health);
      expect(service.getHealth).toHaveBeenCalledWith('uuid-1');
    });
  });
});
