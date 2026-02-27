import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { createErrorResponse } from '@app/common';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { MAILGUN_ERROR_CODES } from '../errors/mailgun-errors.js';
import { MailgunWebhookPayload } from './interfaces/mailgun-webhook.interfaces.js';

function buildPayload(): MailgunWebhookPayload {
  return {
    signature: {
      timestamp: Math.floor(Date.now() / 1000).toString(),
      token: 'test-token',
      signature: 'test-sig',
    },
    'event-data': {
      event: 'delivered',
      id: 'event-id-123',
      timestamp: Date.now() / 1000,
      message: {
        headers: {
          'message-id': '<abc123@distelsa.info>',
          to: 'user@example.com',
          from: 'notifications@distelsa.info',
          subject: 'Test',
        },
      },
      recipient: 'user@example.com',
      'user-variables': {
        notificationId: 'notif-001',
      },
    },
  };
}

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let webhooksService: WebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: WebhooksService,
          useValue: {
            processWebhook: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get(WebhooksController);
    webhooksService = module.get(WebhooksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /webhooks/inbound', () => {
    it('should return { status: "ok" } for valid webhook', async () => {
      const result = await controller.handleInbound(buildPayload());
      expect(result).toEqual({ status: 'ok' });
      expect(webhooksService.processWebhook).toHaveBeenCalledTimes(1);
    });

    it('should throw 401 HttpException when verification fails', async () => {
      const error = createErrorResponse('MG-004', MAILGUN_ERROR_CODES);
      (webhooksService.processWebhook as jest.Mock).mockRejectedValue(error);

      await expect(controller.handleInbound(buildPayload())).rejects.toThrow(
        HttpException,
      );
    });

    it('should return { status: "ok" } for internal errors (fire-and-forget)', async () => {
      (webhooksService.processWebhook as jest.Mock).mockRejectedValue(
        new Error('Unexpected internal error'),
      );

      const result = await controller.handleInbound(buildPayload());
      expect(result).toEqual({ status: 'ok' });
    });

    it('should distinguish HttpException (rethrow) from generic errors (swallow)', async () => {
      // First: HttpException should be rethrown
      const httpError = createErrorResponse('MG-004', MAILGUN_ERROR_CODES);
      (webhooksService.processWebhook as jest.Mock).mockRejectedValue(
        httpError,
      );

      await expect(controller.handleInbound(buildPayload())).rejects.toThrow(
        HttpException,
      );

      // Then: generic Error should be swallowed
      (webhooksService.processWebhook as jest.Mock).mockRejectedValue(
        new TypeError('Cannot read property'),
      );

      const result = await controller.handleInbound(buildPayload());
      expect(result).toEqual({ status: 'ok' });
    });
  });
});
