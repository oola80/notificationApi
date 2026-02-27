import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ChannelsService } from './channels.service.js';
import { ChannelsRepository } from './channels.repository.js';
import { ProviderConfigsRepository } from '../providers/provider-configs.repository.js';
import { Channel } from './entities/channel.entity.js';

describe('ChannelsService', () => {
  let service: ChannelsService;
  let channelsRepo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let providerConfigsRepo: {
    findActiveByChannel: jest.Mock;
    findById: jest.Mock;
  };

  const mockChannel: Partial<Channel> = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Email',
    type: 'email',
    isActive: true,
    routingMode: 'primary',
    fallbackChannelId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSmsChannel: Partial<Channel> = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'SMS',
    type: 'sms',
    isActive: true,
    routingMode: 'primary',
    fallbackChannelId: null,
  };

  beforeEach(async () => {
    channelsRepo = {
      findAll: jest.fn().mockResolvedValue([mockChannel]),
      findById: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      create: jest
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ ...data, id: 'new-uuid' }),
        ),
    };

    providerConfigsRepo = {
      findActiveByChannel: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        { provide: ChannelsRepository, useValue: channelsRepo },
        { provide: ProviderConfigsRepository, useValue: providerConfigsRepo },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
  });

  describe('findAll', () => {
    it('should return all channels with provider info', async () => {
      const providers = [
        {
          id: 'p1',
          providerName: 'SendGrid',
          providerId: 'sendgrid',
          adapterUrl: 'http://adapter-sendgrid:3170',
          isActive: true,
          routingWeight: 100,
          circuitBreakerState: 'CLOSED',
        },
      ];
      providerConfigsRepo.findActiveByChannel.mockResolvedValue(providers);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('email');
      expect(result[0].providers).toHaveLength(1);
      expect(result[0].providers[0].providerName).toBe('SendGrid');
    });

    it('should return channels with empty providers if none active', async () => {
      providerConfigsRepo.findActiveByChannel.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result[0].providers).toHaveLength(0);
    });
  });

  describe('updateConfig', () => {
    it('should update routing mode', async () => {
      channelsRepo.findById.mockResolvedValue({ ...mockChannel });

      const result = await service.updateConfig(mockChannel.id!, {
        routingMode: 'weighted',
      });

      expect(result.routingMode).toBe('weighted');
      expect(channelsRepo.save).toHaveBeenCalled();
    });

    it('should update isActive', async () => {
      channelsRepo.findById.mockResolvedValue({ ...mockChannel });

      const result = await service.updateConfig(mockChannel.id!, {
        isActive: false,
      });

      expect(result.isActive).toBe(false);
    });

    it('should update fallback channel', async () => {
      channelsRepo.findById.mockResolvedValue({ ...mockChannel });
      channelsRepo.findById
        .mockResolvedValueOnce({ ...mockChannel })
        .mockResolvedValueOnce({ ...mockSmsChannel });

      const result = await service.updateConfig(mockChannel.id!, {
        fallbackChannelId: mockSmsChannel.id!,
      });

      expect(result.fallbackChannelId).toBe(mockSmsChannel.id);
    });

    it('should allow setting fallback to null', async () => {
      const channelWithFallback = {
        ...mockChannel,
        fallbackChannelId: mockSmsChannel.id,
      };
      channelsRepo.findById.mockResolvedValue(channelWithFallback);

      const result = await service.updateConfig(mockChannel.id!, {
        fallbackChannelId: null,
      });

      expect(result.fallbackChannelId).toBeNull();
    });

    it('should throw CRS-008 if channel not found', async () => {
      channelsRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateConfig('bad-id', { routingMode: 'weighted' }),
      ).rejects.toThrow(HttpException);

      try {
        await service.updateConfig('bad-id', { routingMode: 'weighted' });
      } catch (error: any) {
        expect(error.getResponse().code).toBe('CRS-008');
      }
    });

    it('should throw CRS-009 if activeProviderId provider not found', async () => {
      channelsRepo.findById.mockResolvedValue({ ...mockChannel });
      providerConfigsRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateConfig(mockChannel.id!, {
          activeProviderId: 'nonexistent-uuid',
        }),
      ).rejects.toThrow(HttpException);

      try {
        await service.updateConfig(mockChannel.id!, {
          activeProviderId: 'nonexistent-uuid',
        });
      } catch (error: any) {
        expect(error.getResponse().code).toBe('CRS-009');
      }
    });

    it('should throw CRS-010 if activeProviderId provider is not active', async () => {
      channelsRepo.findById.mockResolvedValue({ ...mockChannel });
      providerConfigsRepo.findById.mockResolvedValue({
        id: 'p1',
        isActive: false,
        channel: 'email',
      });

      await expect(
        service.updateConfig(mockChannel.id!, { activeProviderId: 'p1' }),
      ).rejects.toThrow(HttpException);

      try {
        await service.updateConfig(mockChannel.id!, { activeProviderId: 'p1' });
      } catch (error: any) {
        expect(error.getResponse().code).toBe('CRS-010');
      }
    });

    it('should throw CRS-001 if provider channel does not match', async () => {
      channelsRepo.findById.mockResolvedValue({ ...mockChannel });
      providerConfigsRepo.findById.mockResolvedValue({
        id: 'p1',
        isActive: true,
        channel: 'sms',
      });

      await expect(
        service.updateConfig(mockChannel.id!, { activeProviderId: 'p1' }),
      ).rejects.toThrow(HttpException);

      try {
        await service.updateConfig(mockChannel.id!, { activeProviderId: 'p1' });
      } catch (error: any) {
        expect(error.getResponse().code).toBe('CRS-001');
      }
    });

    it('should throw CRS-001 if channel is its own fallback', async () => {
      channelsRepo.findById.mockResolvedValue({ ...mockChannel });

      await expect(
        service.updateConfig(mockChannel.id!, {
          fallbackChannelId: mockChannel.id!,
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw CRS-008 if fallback channel not found', async () => {
      channelsRepo.findById
        .mockResolvedValueOnce({ ...mockChannel })
        .mockResolvedValueOnce(null);

      await expect(
        service.updateConfig(mockChannel.id!, {
          fallbackChannelId: 'nonexistent',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('seedDefaultChannels', () => {
    it('should seed 4 default channels when table is empty', async () => {
      channelsRepo.findAll.mockResolvedValue([]);

      await service.onModuleInit();

      expect(channelsRepo.create).toHaveBeenCalledTimes(4);
      expect(channelsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Email', type: 'email' }),
      );
      expect(channelsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'SMS', type: 'sms' }),
      );
      expect(channelsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'WhatsApp', type: 'whatsapp' }),
      );
      expect(channelsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Push', type: 'push' }),
      );
    });

    it('should skip seeding when channels already exist', async () => {
      channelsRepo.findAll.mockResolvedValue([mockChannel]);

      await service.onModuleInit();

      expect(channelsRepo.create).not.toHaveBeenCalled();
    });
  });
});
