import { Test, TestingModule } from '@nestjs/testing';
import { FallbackService } from './fallback.service.js';
import { ChannelsRepository } from '../channels/channels.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { RabbitMQPublisherService } from '../rabbitmq/rabbitmq-publisher.service.js';
import { DispatchMessage } from '../delivery/interfaces/dispatch-message.interface.js';

describe('FallbackService', () => {
  let service: FallbackService;
  let channelsRepo: jest.Mocked<ChannelsRepository>;
  let metricsService: jest.Mocked<MetricsService>;
  let publisherService: jest.Mocked<RabbitMQPublisherService>;

  const mockDispatch: DispatchMessage = {
    notificationId: 'notif-1',
    eventId: 'evt-1',
    ruleId: 'rule-1',
    channel: 'email',
    priority: 'critical',
    recipient: { email: 'test@example.com' },
    content: { body: 'Hello' },
    metadata: { correlationId: 'corr-1' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FallbackService,
        {
          provide: ChannelsRepository,
          useValue: {
            findByType: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementFallbackTriggered: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FallbackService>(FallbackService);
    channelsRepo = module.get(ChannelsRepository);
    metricsService = module.get(MetricsService);
    publisherService = {
      publishFallbackDispatch: jest.fn(),
    } as unknown as jest.Mocked<RabbitMQPublisherService>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return false when dispatch is already a fallback', async () => {
    const fallbackDispatch = { ...mockDispatch, isFallback: true };
    const result = await service.triggerFallback(
      fallbackDispatch,
      publisherService,
    );
    expect(result).toBe(false);
    expect(channelsRepo.findByType).not.toHaveBeenCalled();
  });

  it('should return false when channel has no fallback configured', async () => {
    channelsRepo.findByType.mockResolvedValue({
      id: 'ch-1',
      name: 'Email',
      type: 'email',
      isActive: true,
      routingMode: 'primary',
      fallbackChannelId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await service.triggerFallback(
      mockDispatch,
      publisherService,
    );
    expect(result).toBe(false);
  });

  it('should return false when channel entity not found', async () => {
    channelsRepo.findByType.mockResolvedValue(null);

    const result = await service.triggerFallback(
      mockDispatch,
      publisherService,
    );
    expect(result).toBe(false);
  });

  it('should return false when fallback channel is inactive', async () => {
    channelsRepo.findByType.mockResolvedValue({
      id: 'ch-1',
      fallbackChannelId: 'ch-2',
    } as any);
    channelsRepo.findById.mockResolvedValue({
      id: 'ch-2',
      type: 'sms',
      isActive: false,
    } as any);

    const result = await service.triggerFallback(
      mockDispatch,
      publisherService,
    );
    expect(result).toBe(false);
  });

  it('should return false when fallback channel not found', async () => {
    channelsRepo.findByType.mockResolvedValue({
      id: 'ch-1',
      fallbackChannelId: 'ch-nonexistent',
    } as any);
    channelsRepo.findById.mockResolvedValue(null);

    const result = await service.triggerFallback(
      mockDispatch,
      publisherService,
    );
    expect(result).toBe(false);
  });

  it('should trigger fallback and publish dispatch', async () => {
    channelsRepo.findByType.mockResolvedValue({
      id: 'ch-1',
      fallbackChannelId: 'ch-2',
    } as any);
    channelsRepo.findById.mockResolvedValue({
      id: 'ch-2',
      type: 'sms',
      isActive: true,
    } as any);

    const result = await service.triggerFallback(
      mockDispatch,
      publisherService,
    );

    expect(result).toBe(true);
    expect(publisherService.publishFallbackDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'sms',
        isFallback: true,
        attemptNumber: 1,
        notificationId: 'notif-1',
      }),
    );
    expect(metricsService.incrementFallbackTriggered).toHaveBeenCalledWith(
      'email',
      'sms',
    );
  });

  it('should include fallbackChannel in metadata', async () => {
    channelsRepo.findByType.mockResolvedValue({
      id: 'ch-1',
      fallbackChannelId: 'ch-2',
    } as any);
    channelsRepo.findById.mockResolvedValue({
      id: 'ch-2',
      type: 'sms',
      isActive: true,
    } as any);

    await service.triggerFallback(mockDispatch, publisherService);

    expect(publisherService.publishFallbackDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          fallbackChannel: 'email',
        }),
      }),
    );
  });
});
