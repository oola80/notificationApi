import { SendService } from './send.service.js';
import { ChannelType } from '@app/common';

describe('SendService', () => {
  let service: SendService;
  let mockBrazeClient: any;
  let mockProfileSync: any;
  let mockErrorClassifier: any;
  let mockMetricsService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockBrazeClient = {
      sendMessage: jest.fn().mockResolvedValue({
        dispatch_id: 'dispatch-abc-123',
        errors: [],
        message: 'success',
      }),
    };
    mockProfileSync = {
      ensureProfile: jest.fn().mockResolvedValue('a'.repeat(64)),
    };
    mockErrorClassifier = {
      classifyError: jest.fn(),
    };
    mockMetricsService = {
      incrementSend: jest.fn(),
      observeSendDuration: jest.fn(),
      incrementSendErrors: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn((key: string, def?: any) => {
        const values: Record<string, any> = {
          'braze.appId': 'app-id-123',
          'braze.fromEmail': 'notifications@example.com',
          'braze.fromName': 'Notifications',
          'braze.smsSubscriptionGroup': 'sub-group-sms-123',
          'braze.whatsappSubscriptionGroup': 'sub-group-wa-123',
        };
        return values[key] ?? def;
      }),
    };

    service = new SendService(
      mockBrazeClient,
      mockProfileSync,
      mockErrorClassifier,
      mockMetricsService,
      mockConfigService,
    );
  });

  function makeRequest(overrides: any = {}) {
    return {
      channel: ChannelType.EMAIL,
      recipient: {
        address: 'user@example.com',
        customerId: 'a'.repeat(64),
        ...overrides.recipient,
      },
      content: {
        subject: 'Test Subject',
        body: '<p>Hello World</p>',
        ...overrides.content,
      },
      metadata: {
        notificationId: 'notif-123',
        correlationId: 'corr-456',
        ...overrides.metadata,
      },
      ...overrides,
    };
  }

  describe('Email send — success', () => {
    it('should return success with providerMessageId', async () => {
      const result = await service.send(makeRequest());

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('dispatch-abc-123');
      expect(result.httpStatus).toBe(200);
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toBeNull();
    });

    it('should call profileSync.ensureProfile', async () => {
      await service.send(makeRequest());

      expect(mockProfileSync.ensureProfile).toHaveBeenCalledWith(
        expect.objectContaining({ address: 'user@example.com' }),
        'email',
      );
    });

    it('should build correct email payload', async () => {
      await service.send(makeRequest());

      expect(mockBrazeClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          external_user_ids: ['a'.repeat(64)],
          messages: {
            email: expect.objectContaining({
              app_id: 'app-id-123',
              subject: 'Test Subject',
              body: '<p>Hello World</p>',
              from: 'Notifications <notifications@example.com>',
            }),
          },
        }),
      );
    });

    it('should include extras in email payload', async () => {
      await service.send(makeRequest());

      expect(mockBrazeClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: {
            email: expect.objectContaining({
              extras: expect.objectContaining({
                notificationId: 'notif-123',
                correlationId: 'corr-456',
              }),
            }),
          },
        }),
      );
    });

    it('should include attachments from media', async () => {
      await service.send(
        makeRequest({
          content: {
            subject: 'With attachment',
            body: '<p>See attached</p>',
            media: [
              {
                url: 'https://example.com/invoice.pdf',
                contentType: 'application/pdf',
                filename: 'invoice.pdf',
              },
            ],
          },
        }),
      );

      expect(mockBrazeClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: {
            email: expect.objectContaining({
              attachments: [
                { file_name: 'invoice.pdf', url: 'https://example.com/invoice.pdf' },
              ],
            }),
          },
        }),
      );
    });

    it('should increment success metrics', async () => {
      await service.send(makeRequest());

      expect(mockMetricsService.incrementSend).toHaveBeenCalledWith(
        'braze',
        'email',
        'success',
      );
      expect(mockMetricsService.observeSendDuration).toHaveBeenCalledWith(
        'braze',
        'email',
        expect.any(Number),
      );
    });
  });

  describe('SMS send — success', () => {
    it('should return success for SMS channel', async () => {
      const result = await service.send(
        makeRequest({
          channel: ChannelType.SMS,
          recipient: { address: '+15551234567' },
          content: { body: 'Your order shipped!' },
        }),
      );

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('dispatch-abc-123');
    });

    it('should build correct SMS payload', async () => {
      await service.send(
        makeRequest({
          channel: ChannelType.SMS,
          recipient: { address: '+15551234567' },
          content: { body: 'Your order shipped!' },
        }),
      );

      expect(mockBrazeClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          external_user_ids: ['a'.repeat(64)],
          messages: {
            sms: expect.objectContaining({
              app_id: 'app-id-123',
              subscription_group_id: 'sub-group-sms-123',
              body: 'Your order shipped!',
            }),
          },
        }),
      );
    });

    it('should include MMS media items', async () => {
      await service.send(
        makeRequest({
          channel: ChannelType.SMS,
          recipient: { address: '+15551234567' },
          content: {
            body: 'Check this out!',
            media: [
              {
                url: 'https://example.com/image.jpg',
                contentType: 'image/jpeg',
              },
            ],
          },
        }),
      );

      expect(mockBrazeClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: {
            sms: expect.objectContaining({
              media_items: [
                { url: 'https://example.com/image.jpg', content_type: 'image/jpeg' },
              ],
            }),
          },
        }),
      );
    });
  });

  describe('WhatsApp send — success', () => {
    it('should return success for WhatsApp template send', async () => {
      const result = await service.send(
        makeRequest({
          channel: ChannelType.WHATSAPP,
          recipient: { address: '+15551234567' },
          content: { body: 'template body' },
          metadata: {
            notificationId: 'notif-wa-1',
            templateName: 'order_shipped',
            templateLanguage: 'en',
            templateParameters: [
              { name: 'customer_name', value: 'John' },
              { name: 'order_number', value: '1234' },
            ],
          },
        }),
      );

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('dispatch-abc-123');
    });

    it('should build correct WhatsApp template payload', async () => {
      await service.send(
        makeRequest({
          channel: ChannelType.WHATSAPP,
          recipient: { address: '+15551234567' },
          content: { body: 'template body' },
          metadata: {
            notificationId: 'notif-wa-1',
            templateName: 'order_shipped',
            templateLanguage: 'en',
            templateParameters: [
              { name: 'customer_name', value: 'John' },
              { name: 'order_number', value: '1234' },
            ],
          },
        }),
      );

      expect(mockBrazeClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          external_user_ids: ['a'.repeat(64)],
          messages: {
            whatsapp: expect.objectContaining({
              app_id: 'app-id-123',
              subscription_group_id: 'sub-group-wa-123',
              message_type: 'template_message',
              message: expect.objectContaining({
                template_name: 'order_shipped',
                template_language_code: 'en',
                variables: [
                  { key: 'customer_name', value: 'John' },
                  { key: 'order_number', value: '1234' },
                ],
              }),
            }),
          },
        }),
      );
    });

    it('should include IMAGE header when media is present', async () => {
      await service.send(
        makeRequest({
          channel: ChannelType.WHATSAPP,
          recipient: { address: '+15551234567' },
          content: {
            body: 'template body',
            media: [
              {
                url: 'https://example.com/image.jpg',
                contentType: 'image/jpeg',
              },
            ],
          },
          metadata: {
            notificationId: 'notif-wa-2',
            templateName: 'promo_image',
            templateLanguage: 'en',
          },
        }),
      );

      expect(mockBrazeClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: {
            whatsapp: expect.objectContaining({
              message: expect.objectContaining({
                header: {
                  type: 'IMAGE',
                  url: 'https://example.com/image.jpg',
                },
              }),
            }),
          },
        }),
      );
    });

    it('should not include header when media is non-image', async () => {
      await service.send(
        makeRequest({
          channel: ChannelType.WHATSAPP,
          recipient: { address: '+15551234567' },
          content: {
            body: 'template body',
            media: [
              {
                url: 'https://example.com/doc.pdf',
                contentType: 'application/pdf',
              },
            ],
          },
          metadata: {
            notificationId: 'notif-wa-3',
            templateName: 'order_receipt',
            templateLanguage: 'en',
          },
        }),
      );

      const payload = mockBrazeClient.sendMessage.mock.calls[0][0];
      expect(payload.messages.whatsapp.message.header).toBeUndefined();
    });

    it('should build WhatsApp payload without parameters', async () => {
      await service.send(
        makeRequest({
          channel: ChannelType.WHATSAPP,
          recipient: { address: '+15551234567' },
          content: { body: 'template body' },
          metadata: {
            notificationId: 'notif-wa-4',
            templateName: 'simple_template',
            templateLanguage: 'es',
          },
        }),
      );

      const payload = mockBrazeClient.sendMessage.mock.calls[0][0];
      expect(payload.messages.whatsapp.message.template_name).toBe(
        'simple_template',
      );
      expect(payload.messages.whatsapp.message.template_language_code).toBe(
        'es',
      );
      expect(payload.messages.whatsapp.message.variables).toBeUndefined();
    });
  });

  describe('WhatsApp missing subscription group', () => {
    it('should fail when WhatsApp subscription group is not configured', async () => {
      const noWaConfig = {
        get: jest.fn((key: string, def?: any) => {
          const values: Record<string, any> = {
            'braze.appId': 'app-id-123',
            'braze.fromEmail': 'notifications@example.com',
            'braze.fromName': 'Notifications',
            'braze.smsSubscriptionGroup': 'sub-group-sms-123',
            'braze.whatsappSubscriptionGroup': '',
          };
          return values[key] ?? def;
        }),
      };

      const svc = new SendService(
        mockBrazeClient,
        mockProfileSync,
        mockErrorClassifier,
        mockMetricsService,
        noWaConfig as any,
      );

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: false,
        errorMessage: 'WhatsApp subscription group ID is required',
        httpStatus: 400,
        errorCode: 'BZ-010',
      });

      const result = await svc.send(
        makeRequest({
          channel: ChannelType.WHATSAPP,
          content: { body: 'Test WA' },
          metadata: {
            notificationId: 'notif-wa-miss',
            templateName: 'test_tmpl',
            templateLanguage: 'en',
          },
        }),
      );

      expect(result.success).toBe(false);
    });
  });

  describe('Push send — success', () => {
    it('should return success for push channel', async () => {
      const result = await service.send(
        makeRequest({
          channel: ChannelType.PUSH,
          recipient: { address: 'device-token-123' },
          content: { subject: 'Push Title', body: 'Push body text' },
        }),
      );

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('dispatch-abc-123');
    });

    it('should build both apple_push and android_push payloads', async () => {
      await service.send(
        makeRequest({
          channel: ChannelType.PUSH,
          recipient: { address: 'device-token-123' },
          content: { subject: 'Push Title', body: 'Push body text' },
        }),
      );

      expect(mockBrazeClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          external_user_ids: ['a'.repeat(64)],
          messages: expect.objectContaining({
            apple_push: expect.objectContaining({
              app_id: 'app-id-123',
              alert: { title: 'Push Title', body: 'Push body text' },
            }),
            android_push: expect.objectContaining({
              app_id: 'app-id-123',
              title: 'Push Title',
              alert: 'Push body text',
            }),
          }),
        }),
      );
    });

    it('should include media in push payloads', async () => {
      await service.send(
        makeRequest({
          channel: ChannelType.PUSH,
          recipient: { address: 'device-token-123' },
          content: {
            subject: 'Rich Push',
            body: 'See this image',
            media: [
              {
                url: 'https://example.com/hero.jpg',
                contentType: 'image/jpeg',
              },
            ],
          },
        }),
      );

      const payload = mockBrazeClient.sendMessage.mock.calls[0][0];
      expect(payload.messages.apple_push.mutable_content).toBe(true);
      expect(payload.messages.apple_push.media_url).toBe(
        'https://example.com/hero.jpg',
      );
      expect(payload.messages.android_push.image_url).toBe(
        'https://example.com/hero.jpg',
      );
    });

    it('should not include media fields when no media', async () => {
      await service.send(
        makeRequest({
          channel: ChannelType.PUSH,
          recipient: { address: 'device-token-123' },
          content: { subject: 'Simple Push', body: 'No media here' },
        }),
      );

      const payload = mockBrazeClient.sendMessage.mock.calls[0][0];
      expect(payload.messages.apple_push.mutable_content).toBeUndefined();
      expect(payload.messages.apple_push.media_url).toBeUndefined();
      expect(payload.messages.android_push.image_url).toBeUndefined();
    });
  });

  describe('Profile sync failure', () => {
    it('should return failure when profile sync throws', async () => {
      const httpError = {
        message: 'Profile sync failed',
        getStatus: () => 502,
      };
      mockProfileSync.ensureProfile.mockRejectedValue(httpError);
      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: false,
        errorMessage: 'Profile sync failed',
        httpStatus: 502,
        errorCode: 'BZ-006',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(mockBrazeClient.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Braze API error', () => {
    it('should classify retryable error (429)', async () => {
      const apiError = new Error('Rate limited') as any;
      apiError.isAxiosError = true;
      apiError.response = { status: 429 };
      mockBrazeClient.sendMessage.mockRejectedValue(apiError);

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: true,
        errorMessage: 'Braze rate limit exceeded',
        httpStatus: 429,
        errorCode: 'BZ-004',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.httpStatus).toBe(429);
    });

    it('should classify non-retryable error (401)', async () => {
      const apiError = new Error('Unauthorized') as any;
      apiError.isAxiosError = true;
      apiError.response = { status: 401 };
      mockBrazeClient.sendMessage.mockRejectedValue(apiError);

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: false,
        errorMessage: 'Invalid Braze API key',
        httpStatus: 401,
        errorCode: 'BZ-003',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.httpStatus).toBe(401);
    });

    it('should increment failure metrics on error', async () => {
      mockBrazeClient.sendMessage.mockRejectedValue(new Error('API error'));
      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: false,
        errorMessage: 'Failed',
        httpStatus: 500,
        errorCode: 'PA-003',
      });

      await service.send(makeRequest());

      expect(mockMetricsService.incrementSend).toHaveBeenCalledWith(
        'braze',
        'email',
        'failure',
      );
      expect(mockMetricsService.incrementSendErrors).toHaveBeenCalledWith(
        'braze',
        'email',
        'PA-003',
      );
    });
  });

  describe('SMS missing subscription group', () => {
    it('should fail when SMS subscription group is not configured', async () => {
      // Recreate service without SMS subscription group
      const noSmsConfig = {
        get: jest.fn((key: string, def?: any) => {
          const values: Record<string, any> = {
            'braze.appId': 'app-id-123',
            'braze.fromEmail': 'notifications@example.com',
            'braze.fromName': 'Notifications',
            'braze.smsSubscriptionGroup': '',
          };
          return values[key] ?? def;
        }),
      };

      const svc = new SendService(
        mockBrazeClient,
        mockProfileSync,
        mockErrorClassifier,
        mockMetricsService,
        noSmsConfig as any,
      );

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: false,
        errorMessage: 'SMS subscription group ID is required',
        httpStatus: 400,
        errorCode: 'BZ-010',
      });

      const result = await svc.send(
        makeRequest({
          channel: ChannelType.SMS,
          content: { body: 'Test SMS' },
        }),
      );

      expect(result.success).toBe(false);
    });
  });
});
