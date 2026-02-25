import { Test, TestingModule } from '@nestjs/testing';
import { WebhookController } from './webhook.controller.js';
import { WebhookService } from './webhook.service.js';
import { SourceAuthGuard } from './guards/source-auth.guard.js';
import { WebhookRateLimitGuard } from '../rate-limiter/guards/webhook-rate-limit.guard.js';

describe('WebhookController', () => {
  let controller: WebhookController;
  let service: jest.Mocked<WebhookService>;

  beforeEach(async () => {
    const mockService = {
      processWebhookEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [{ provide: WebhookService, useValue: mockService }],
    })
      .overrideGuard(SourceAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WebhookRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WebhookController>(WebhookController);
    service = module.get(WebhookService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return 202 for new events', async () => {
    const result = {
      eventId: 'uuid',
      correlationId: 'corr-id',
      status: 'published',
    };
    service.processWebhookEvent.mockResolvedValue(result);

    const mockResponse: any = { status: jest.fn() };

    const dto = {
      sourceId: 'shopify',
      cycleId: 'CYCLE-001',
      eventType: 'order.created',
      payload: { id: '123' },
    };

    const response = await controller.receiveEvent(
      dto,
      mockResponse,
      'req-id',
    );

    expect(response.status).toBe('published');
    expect(mockResponse.status).toHaveBeenCalledWith(202);
  });

  it('should return 200 for duplicate events', async () => {
    const result = {
      eventId: 'existing-uuid',
      correlationId: 'corr-id',
      status: 'duplicate',
    };
    service.processWebhookEvent.mockResolvedValue(result);

    const mockResponse: any = { status: jest.fn() };

    const dto = {
      sourceId: 'shopify',
      cycleId: 'CYCLE-001',
      eventType: 'order.created',
      sourceEventId: 'SHP-001',
      payload: { id: '123' },
    };

    const response = await controller.receiveEvent(
      dto,
      mockResponse,
      'req-id',
    );

    expect(response.status).toBe('duplicate');
    expect(mockResponse.status).toHaveBeenCalledWith(200);
  });

  it('should generate correlationId when x-request-id not provided', async () => {
    const result = {
      eventId: 'uuid',
      correlationId: 'generated',
      status: 'published',
    };
    service.processWebhookEvent.mockResolvedValue(result);

    const mockResponse: any = { status: jest.fn() };

    const dto = {
      sourceId: 'shopify',
      cycleId: 'CYCLE-001',
      eventType: 'order.created',
      payload: { id: '123' },
    };

    await controller.receiveEvent(dto, mockResponse, undefined);

    expect(service.processWebhookEvent).toHaveBeenCalledWith(
      dto,
      null,
      expect.any(String),
    );
  });

  it('should use x-request-id as correlationId when provided', async () => {
    const result = {
      eventId: 'uuid',
      correlationId: 'my-request-id',
      status: 'published',
    };
    service.processWebhookEvent.mockResolvedValue(result);

    const mockResponse: any = { status: jest.fn() };

    const dto = {
      sourceId: 'shopify',
      cycleId: 'CYCLE-001',
      eventType: 'order.created',
      payload: { id: '123' },
    };

    await controller.receiveEvent(
      dto,
      mockResponse,
      'my-request-id',
    );

    expect(service.processWebhookEvent).toHaveBeenCalledWith(
      dto,
      null,
      'my-request-id',
    );
  });
});
