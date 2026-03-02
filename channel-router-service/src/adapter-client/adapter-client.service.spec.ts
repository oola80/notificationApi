import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { AdapterClientService } from './adapter-client.service.js';
import { MetricsService } from '../metrics/metrics.service.js';

describe('AdapterClientService', () => {
  let service: AdapterClientService;
  let httpService: { get: jest.Mock; post: jest.Mock };
  let metricsService: Partial<MetricsService>;

  const adapterUrl = 'http://adapter-sendgrid:3170';

  beforeEach(async () => {
    httpService = {
      get: jest.fn(),
      post: jest.fn(),
    };

    metricsService = {
      observeAdapterCallDuration: jest.fn(),
      incrementAdapterUnavailable: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdapterClientService,
        { provide: HttpService, useValue: httpService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(10000),
          },
        },
        { provide: MetricsService, useValue: metricsService },
      ],
    }).compile();

    service = module.get<AdapterClientService>(AdapterClientService);
  });

  describe('send', () => {
    const sendRequest = {
      notificationId: 'n-123',
      channel: 'email',
      priority: 'normal',
      recipient: { email: 'test@example.com' },
      content: { body: '<p>Hello</p>' },
      metadata: { correlationId: 'corr-123' },
    };

    it('should return SendResult on successful send', async () => {
      const sendResult = {
        success: true,
        providerMessageId: 'msg-123',
        retryable: false,
        errorMessage: null,
        httpStatus: 200,
        providerResponse: {},
      };

      httpService.post.mockReturnValue(
        of({ data: sendResult, status: 200 } as AxiosResponse),
      );

      const result = await service.send(adapterUrl, sendRequest);

      expect(result).toEqual(sendResult);
      expect(httpService.post).toHaveBeenCalledWith(
        `${adapterUrl}/send`,
        expect.objectContaining({
          channel: 'email',
          recipient: { address: 'test@example.com', name: undefined },
          content: expect.objectContaining({ body: '<p>Hello</p>' }),
          metadata: expect.objectContaining({
            notificationId: 'n-123',
            correlationId: 'corr-123',
            priority: 'normal',
          }),
        }),
        { timeout: 10000 },
      );
    });

    it('should return retryable SendResult on timeout', async () => {
      const error = new Error('timeout') as AxiosError;
      error.code = 'ECONNABORTED';
      (error as any).response = undefined;

      httpService.post.mockReturnValue(throwError(() => error));

      const result = await service.send(adapterUrl, sendRequest);

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.httpStatus).toBe(408);
      expect(result.errorMessage).toBe('timeout');
    });

    it('should return retryable SendResult on connection refused', async () => {
      const error = new Error('connection refused') as AxiosError;
      error.code = 'ECONNREFUSED';
      (error as any).response = undefined;

      httpService.post.mockReturnValue(throwError(() => error));

      const result = await service.send(adapterUrl, sendRequest);

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.httpStatus).toBe(503);
    });

    it('should return non-retryable SendResult on 4xx error', async () => {
      const error = new Error('bad request') as any;
      error.code = undefined;
      error.response = { status: 400, data: { error: 'invalid payload' } };

      httpService.post.mockReturnValue(throwError(() => error));

      const result = await service.send(adapterUrl, sendRequest);

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.httpStatus).toBe(400);
      expect(result.providerResponse).toEqual({ error: 'invalid payload' });
    });

    it('should return retryable SendResult on 5xx error', async () => {
      const error = new Error('internal server error') as any;
      error.code = undefined;
      error.response = { status: 500, data: {} };

      httpService.post.mockReturnValue(throwError(() => error));

      const result = await service.send(adapterUrl, sendRequest);

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.httpStatus).toBe(500);
    });

    it('should pass template metadata in adapter payload when present', async () => {
      const templateRequest = {
        notificationId: 'n-tpl',
        channel: 'whatsapp',
        priority: 'normal',
        recipient: { phone: '+50212345678' },
        content: {
          body: 'Order #123,Shipped',
          templateName: 'order-delay',
          templateLanguage: 'es',
          templateParameters: ['Order #123', 'Shipped'],
        },
        metadata: { correlationId: 'corr-tpl' },
      };

      const sendResult = {
        success: true,
        providerMessageId: 'wamid-123',
        retryable: false,
        errorMessage: null,
        httpStatus: 200,
        providerResponse: {},
      };

      httpService.post.mockReturnValue(
        of({ data: sendResult, status: 200 } as AxiosResponse),
      );

      await service.send(adapterUrl, templateRequest);

      const payload = httpService.post.mock.calls[0][1];
      expect(payload.metadata.templateName).toBe('order-delay');
      expect(payload.metadata.templateLanguage).toBe('es');
      expect(payload.metadata.templateParameters).toEqual([
        'Order #123',
        'Shipped',
      ]);
    });

    it('should not include template metadata when templateName is absent', async () => {
      const sendResult = {
        success: true,
        providerMessageId: 'msg-123',
        retryable: false,
        errorMessage: null,
        httpStatus: 200,
        providerResponse: {},
      };

      httpService.post.mockReturnValue(
        of({ data: sendResult, status: 200 } as AxiosResponse),
      );

      await service.send(adapterUrl, sendRequest);

      const payload = httpService.post.mock.calls[0][1];
      expect(payload.metadata.templateName).toBeUndefined();
      expect(payload.metadata.templateLanguage).toBeUndefined();
      expect(payload.metadata.templateParameters).toBeUndefined();
    });
  });

  describe('address resolution by channel', () => {
    const multiAddressRecipient = {
      email: 'user@example.com',
      phone: '+50212345678',
      deviceToken: 'fcm-token-abc',
    };

    const makeRequest = (channel: string, recipient: Record<string, any>) => ({
      notificationId: 'n-addr',
      channel,
      priority: 'normal',
      recipient,
      content: { body: 'test' },
      metadata: { correlationId: 'corr-addr' },
    });

    const sendResult = {
      success: true,
      providerMessageId: 'msg-addr',
      retryable: false,
      errorMessage: null,
      httpStatus: 200,
      providerResponse: {},
    };

    beforeEach(() => {
      httpService.post.mockReturnValue(
        of({ data: sendResult, status: 200 } as AxiosResponse),
      );
    });

    it('should pick email for email channel when both email and phone exist', async () => {
      await service.send(adapterUrl, makeRequest('email', multiAddressRecipient));
      const payload = httpService.post.mock.calls[0][1];
      expect(payload.recipient.address).toBe('user@example.com');
    });

    it('should pick phone for whatsapp channel when both email and phone exist', async () => {
      await service.send(adapterUrl, makeRequest('whatsapp', multiAddressRecipient));
      const payload = httpService.post.mock.calls[0][1];
      expect(payload.recipient.address).toBe('+50212345678');
    });

    it('should pick phone for sms channel when both email and phone exist', async () => {
      await service.send(adapterUrl, makeRequest('sms', multiAddressRecipient));
      const payload = httpService.post.mock.calls[0][1];
      expect(payload.recipient.address).toBe('+50212345678');
    });

    it('should pick deviceToken for push channel when deviceToken and email exist', async () => {
      await service.send(adapterUrl, makeRequest('push', multiAddressRecipient));
      const payload = httpService.post.mock.calls[0][1];
      expect(payload.recipient.address).toBe('fcm-token-abc');
    });

    it('should fall back to email for whatsapp channel when only email exists', async () => {
      await service.send(adapterUrl, makeRequest('whatsapp', { email: 'user@example.com' }));
      const payload = httpService.post.mock.calls[0][1];
      expect(payload.recipient.address).toBe('user@example.com');
    });

    it('should fall back to phone for email channel when only phone exists', async () => {
      await service.send(adapterUrl, makeRequest('email', { phone: '+50212345678' }));
      const payload = httpService.post.mock.calls[0][1];
      expect(payload.recipient.address).toBe('+50212345678');
    });

    it('should use default email-first priority for unknown channel', async () => {
      await service.send(adapterUrl, makeRequest('carrier-pigeon', multiAddressRecipient));
      const payload = httpService.post.mock.calls[0][1];
      expect(payload.recipient.address).toBe('user@example.com');
    });
  });

  describe('checkHealth', () => {
    it('should return health response on success', async () => {
      const healthResponse = {
        status: 'ok',
        providerId: 'sendgrid',
        providerName: 'SendGrid',
        supportedChannels: ['email'],
        latencyMs: 45,
        details: { apiReachable: true },
      };

      httpService.get.mockReturnValue(
        of({ data: healthResponse, status: 200 } as AxiosResponse),
      );

      const result = await service.checkHealth(adapterUrl);

      expect(result).toEqual(healthResponse);
      expect(httpService.get).toHaveBeenCalledWith(`${adapterUrl}/health`, {
        timeout: 10000,
      });
    });

    it('should throw on health check failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('connection refused')),
      );

      await expect(service.checkHealth(adapterUrl)).rejects.toThrow(
        'connection refused',
      );
    });
  });

  describe('getCapabilities', () => {
    it('should return capabilities response on success', async () => {
      const capabilitiesResponse = {
        providerId: 'sendgrid',
        providerName: 'SendGrid',
        supportedChannels: ['email'],
        supportsAttachments: true,
        supportsMediaUrls: false,
        maxAttachmentSizeMb: 30,
        maxRecipientsPerRequest: 1,
        webhookPath: '/webhooks/inbound',
      };

      httpService.get.mockReturnValue(
        of({ data: capabilitiesResponse, status: 200 } as AxiosResponse),
      );

      const result = await service.getCapabilities(adapterUrl);

      expect(result).toEqual(capabilitiesResponse);
      expect(httpService.get).toHaveBeenCalledWith(
        `${adapterUrl}/capabilities`,
        { timeout: 10000 },
      );
    });

    it('should throw on capabilities fetch failure', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('not found')));

      await expect(service.getCapabilities(adapterUrl)).rejects.toThrow(
        'not found',
      );
    });
  });
});
