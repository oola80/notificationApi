import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';

describe('ChannelsController', () => {
  let controller: ChannelsController;
  let service: {
    findAll: jest.Mock;
    updateConfig: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      updateConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [{ provide: ChannelsService, useValue: service }],
    }).compile();

    controller = module.get<ChannelsController>(ChannelsController);
  });

  describe('GET /channels', () => {
    it('should return all channels with provider info', async () => {
      const channels = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Email',
          type: 'email',
          isActive: true,
          routingMode: 'primary',
          fallbackChannelId: null,
          providers: [
            {
              id: '22222222-2222-2222-2222-222222222222',
              providerName: 'SendGrid',
              providerId: 'sendgrid',
              adapterUrl: 'http://adapter-sendgrid:3170',
              isActive: true,
              routingWeight: 100,
              circuitBreakerState: 'CLOSED',
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      service.findAll.mockResolvedValue(channels);

      const result = await controller.findAll();

      expect(result).toEqual(channels);
      expect(service.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('PUT /channels/:id/config', () => {
    it('should delegate to service.updateConfig', async () => {
      const id = '11111111-1111-1111-1111-111111111111';
      const dto = { routingMode: 'weighted', isActive: true };
      const updated = {
        id,
        name: 'Email',
        type: 'email',
        isActive: true,
        routingMode: 'weighted',
        fallbackChannelId: null,
      };

      service.updateConfig.mockResolvedValue(updated);

      const result = await controller.updateConfig(id, dto);

      expect(result).toEqual(updated);
      expect(service.updateConfig).toHaveBeenCalledWith(id, dto);
    });
  });
});
