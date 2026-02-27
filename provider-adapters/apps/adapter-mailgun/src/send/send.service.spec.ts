import { SendService } from './send.service.js';
import { ChannelType } from '@app/common';
import { of, throwError } from 'rxjs';
import FormData from 'form-data';

describe('SendService', () => {
  let service: SendService;
  let mockMailgunClient: any;
  let mockErrorClassifier: any;
  let mockMetricsService: any;
  let mockHttpService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockMailgunClient = {
      buildFormData: jest.fn().mockReturnValue(new FormData()),
      sendMessage: jest.fn(),
    };
    mockErrorClassifier = {
      classifyError: jest.fn(),
    };
    mockMetricsService = {
      incrementSend: jest.fn(),
      observeSendDuration: jest.fn(),
      incrementSendErrors: jest.fn(),
    };
    mockHttpService = {
      get: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn((key: string, def?: any) => {
        const values: Record<string, any> = {
          'mailgun.fromAddress': 'notifications@distelsa.info',
        };
        return values[key] ?? def;
      }),
    };

    service = new SendService(
      mockMailgunClient,
      mockErrorClassifier,
      mockMetricsService,
      mockHttpService,
      mockConfigService,
    );
  });

  function makeRequest(overrides: any = {}) {
    return {
      channel: ChannelType.EMAIL,
      recipient: { address: 'user@example.com', ...overrides.recipient },
      content: {
        subject: 'Test Subject',
        body: '<p>Hello World</p>',
        ...overrides.content,
      },
      metadata: {
        notificationId: 'notif-123',
        correlationId: 'corr-456',
        cycleId: 'cycle-789',
        ...overrides.metadata,
      },
      ...overrides,
    };
  }

  describe('Basic email send — success', () => {
    it('should return success with providerMessageId', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<20230101120000.abc123@distelsa.info>',
        message: 'Queued. Thank you.',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe(
        '<20230101120000.abc123@distelsa.info>',
      );
      expect(result.httpStatus).toBe(200);
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toBeNull();
    });

    it('should call buildFormData with correct options', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(makeRequest());

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'notifications@distelsa.info',
          to: 'user@example.com',
          subject: 'Test Subject',
          html: '<p>Hello World</p>',
          headers: expect.objectContaining({
            'X-Notification-Id': 'notif-123',
          }),
          customVariables: expect.objectContaining({
            notificationId: 'notif-123',
            correlationId: 'corr-456',
            cycleId: 'cycle-789',
          }),
        }),
      );
    });

    it('should increment success metrics', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(makeRequest());

      expect(mockMetricsService.incrementSend).toHaveBeenCalledWith(
        'mailgun',
        'email',
        'success',
      );
      expect(mockMetricsService.observeSendDuration).toHaveBeenCalledWith(
        'mailgun',
        'email',
        expect.any(Number),
      );
    });
  });

  describe('Recipient name formatting', () => {
    it('should format "to" as "Name <email>" when name is present', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(
        makeRequest({
          recipient: { address: 'user@example.com', name: 'John Doe' },
        }),
      );

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'John Doe <user@example.com>',
        }),
      );
    });

    it('should use plain email when no name', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(makeRequest());

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
        }),
      );
    });
  });

  describe('Content handling', () => {
    it('should use htmlBody when provided', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(
        makeRequest({
          content: {
            subject: 'Test',
            body: 'plain text',
            htmlBody: '<h1>HTML Body</h1>',
          },
        }),
      );

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<h1>HTML Body</h1>',
        }),
      );
    });

    it('should detect HTML in body and use html field', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(
        makeRequest({
          content: { subject: 'Test', body: '<p>HTML content</p>' },
        }),
      );

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<p>HTML content</p>',
        }),
      );
    });

    it('should use text field for plain text body', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(
        makeRequest({
          content: { subject: 'Test', body: 'Just plain text, no HTML' },
        }),
      );

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Just plain text, no HTML',
        }),
      );
    });
  });

  describe('Custom variables', () => {
    it('should include notificationId, correlationId, cycleId', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(makeRequest());

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          customVariables: expect.objectContaining({
            notificationId: 'notif-123',
            correlationId: 'corr-456',
            cycleId: 'cycle-789',
          }),
        }),
      );
    });

    it('should omit optional fields when not provided', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(
        makeRequest({
          metadata: { notificationId: 'notif-123' },
        }),
      );

      const callArgs = mockMailgunClient.buildFormData.mock.calls[0][0];
      expect(callArgs.customVariables.notificationId).toBe('notif-123');
      expect(callArgs.customVariables.correlationId).toBeUndefined();
      expect(callArgs.customVariables.cycleId).toBeUndefined();
    });
  });

  describe('Channel validation', () => {
    it('should reject SMS channel with MG-001', async () => {
      const result = await service.send(
        makeRequest({ channel: ChannelType.SMS }),
      );

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toContain('sms');
      expect(result.httpStatus).toBe(400);
      expect(mockMailgunClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should reject WhatsApp channel', async () => {
      const result = await service.send(
        makeRequest({ channel: ChannelType.WHATSAPP }),
      );

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toContain('whatsapp');
    });

    it('should reject Push channel', async () => {
      const result = await service.send(
        makeRequest({ channel: ChannelType.PUSH }),
      );

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toContain('push');
    });
  });

  describe('Attachment handling — Base64', () => {
    it('should decode Base64 attachments and include in request', async () => {
      const base64Content = Buffer.from('PDF content here').toString('base64');

      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(
        makeRequest({
          content: {
            subject: 'Test',
            body: '<p>With attachment</p>',
            media: [
              {
                url: base64Content,
                contentType: 'application/pdf',
                filename: 'report.pdf',
              },
            ],
          },
        }),
      );

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: 'report.pdf',
              contentType: 'application/pdf',
              data: expect.any(Buffer),
            }),
          ]),
        }),
      );
    });
  });

  describe('Attachment handling — URL download', () => {
    it('should download URL attachments and include in request', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: Buffer.from('downloaded content'),
        }),
      );

      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(
        makeRequest({
          content: {
            subject: 'Test',
            body: '<p>With URL attachment</p>',
            media: [
              {
                url: 'https://example.com/file.pdf',
                contentType: 'application/pdf',
                filename: 'file.pdf',
              },
            ],
          },
        }),
      );

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://example.com/file.pdf',
        expect.objectContaining({
          responseType: 'arraybuffer',
          timeout: 5000,
        }),
      );

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: 'file.pdf',
              contentType: 'application/pdf',
            }),
          ]),
        }),
      );
    });
  });

  describe('Attachment failure — graceful degradation', () => {
    it('should skip failed attachment and send without it', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Download failed')),
      );

      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      const result = await service.send(
        makeRequest({
          content: {
            subject: 'Test',
            body: '<p>Body</p>',
            media: [
              {
                url: 'https://example.com/broken.pdf',
                contentType: 'application/pdf',
                filename: 'broken.pdf',
              },
            ],
          },
        }),
      );

      expect(result.success).toBe(true);
      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [],
        }),
      );
    });
  });

  describe('Error handling — Mailgun API errors', () => {
    it('should classify 429 as retryable', async () => {
      const apiError = new Error('Rate limited') as any;
      apiError.isAxiosError = true;
      apiError.response = { status: 429 };
      mockMailgunClient.sendMessage.mockRejectedValue(apiError);

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: true,
        errorMessage: 'Mailgun rate limit exceeded',
        httpStatus: 429,
        errorCode: 'MG-007',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.errorMessage).toBe('Mailgun rate limit exceeded');
      expect(result.httpStatus).toBe(429);
    });

    it('should classify 401 as non-retryable', async () => {
      const apiError = new Error('Unauthorized') as any;
      apiError.isAxiosError = true;
      apiError.response = { status: 401 };
      mockMailgunClient.sendMessage.mockRejectedValue(apiError);

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: false,
        errorMessage: 'Invalid Mailgun API key',
        httpStatus: 401,
        errorCode: 'MG-005',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.httpStatus).toBe(401);
    });

    it('should classify 5xx as retryable', async () => {
      const apiError = new Error('Server error') as any;
      mockMailgunClient.sendMessage.mockRejectedValue(apiError);

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: true,
        errorMessage: 'Mailgun server error (500)',
        httpStatus: 500,
        errorCode: 'MG-002',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });

    it('should classify 404 as non-retryable', async () => {
      const apiError = new Error('Not found') as any;
      mockMailgunClient.sendMessage.mockRejectedValue(apiError);

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: false,
        errorMessage: 'Mailgun sending domain not found',
        httpStatus: 404,
        errorCode: 'MG-006',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.httpStatus).toBe(404);
    });

    it('should classify connection timeout as retryable', async () => {
      const apiError = new Error('timeout of 10000ms exceeded') as any;
      apiError.code = 'ECONNABORTED';
      mockMailgunClient.sendMessage.mockRejectedValue(apiError);

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: true,
        errorMessage: 'Connection error: timeout of 10000ms exceeded',
        httpStatus: 503,
        errorCode: 'MG-002',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });
  });

  describe('Error metrics', () => {
    it('should increment failure metrics on error', async () => {
      mockMailgunClient.sendMessage.mockRejectedValue(
        new Error('API error'),
      );
      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: false,
        errorMessage: 'Failed',
        httpStatus: 500,
        errorCode: 'MG-003',
      });

      await service.send(makeRequest());

      expect(mockMetricsService.incrementSend).toHaveBeenCalledWith(
        'mailgun',
        'email',
        'failure',
      );
      expect(mockMetricsService.observeSendDuration).toHaveBeenCalledWith(
        'mailgun',
        'email',
        expect.any(Number),
      );
      expect(mockMetricsService.incrementSendErrors).toHaveBeenCalledWith(
        'mailgun',
        'email',
        'MG-003',
      );
    });
  });

  describe('fromAddress override', () => {
    it('should use request fromAddress when provided', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(
        makeRequest({ fromAddress: 'custom@distelsa.info' }),
      );

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'custom@distelsa.info',
        }),
      );
    });

    it('should use default fromAddress when not provided', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(makeRequest());

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'notifications@distelsa.info',
        }),
      );
    });
  });

  describe('replyTo header', () => {
    it('should include Reply-To header when replyTo is set', async () => {
      mockMailgunClient.sendMessage.mockResolvedValue({
        id: '<test@distelsa.info>',
        message: 'Queued.',
      });

      await service.send(
        makeRequest({ replyTo: 'reply@example.com' }),
      );

      expect(mockMailgunClient.buildFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Reply-To': 'reply@example.com',
          }),
        }),
      );
    });
  });
});
