import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { createErrorResponse } from '@app/common';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { SES_ERROR_CODES } from '../errors/ses-errors.js';
import type { SnsMessage } from './interfaces/ses-webhook.interfaces.js';

function buildSnsMessage(): SnsMessage {
  return {
    Type: 'Notification',
    MessageId: 'msg-id-123',
    TopicArn: 'arn:aws:sns:us-east-1:123456789:ses-notifications',
    Message: '{"eventType":"Delivery","mail":{"messageId":"test"}}',
    Timestamp: '2024-01-31T12:00:00.000Z',
    SignatureVersion: '1',
    Signature: 'test-sig',
    SigningCertURL:
      'https://sns.us-east-1.amazonaws.com/cert.pem',
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
      const result = await controller.handleInbound(buildSnsMessage());
      expect(result).toEqual({ status: 'ok' });
      expect(webhooksService.processWebhook).toHaveBeenCalledTimes(1);
    });

    it('should throw 401 HttpException when verification fails', async () => {
      const error = createErrorResponse('SES-009', SES_ERROR_CODES);
      (webhooksService.processWebhook as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.handleInbound(buildSnsMessage()),
      ).rejects.toThrow(HttpException);
    });

    it('should return { status: "ok" } for internal errors (fire-and-forget)', async () => {
      (webhooksService.processWebhook as jest.Mock).mockRejectedValue(
        new Error('Unexpected internal error'),
      );

      const result = await controller.handleInbound(buildSnsMessage());
      expect(result).toEqual({ status: 'ok' });
    });

    it('should distinguish HttpException (rethrow) from generic errors (swallow)', async () => {
      // First: HttpException should be rethrown
      const httpError = createErrorResponse('SES-009', SES_ERROR_CODES);
      (webhooksService.processWebhook as jest.Mock).mockRejectedValue(
        httpError,
      );

      await expect(
        controller.handleInbound(buildSnsMessage()),
      ).rejects.toThrow(HttpException);

      // Then: generic Error should be swallowed
      (webhooksService.processWebhook as jest.Mock).mockRejectedValue(
        new TypeError('Cannot read property'),
      );

      const result = await controller.handleInbound(buildSnsMessage());
      expect(result).toEqual({ status: 'ok' });
    });
  });
});
