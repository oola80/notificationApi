import { SendService } from './send.service.js';
import { ChannelType } from '@app/common';
import { of, throwError } from 'rxjs';

describe('SendService', () => {
  let service: SendService;
  let mockSesClient: any;
  let mockErrorClassifier: any;
  let mockMetricsService: any;
  let mockHttpService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockSesClient = {
      sendEmail: jest.fn(),
      checkConnectivity: jest.fn(),
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
          'ses.fromEmail': 'noreply@example.com',
          'ses.fromName': 'Notifications',
          'ses.mode': 'smtp',
        };
        return values[key] ?? def;
      }),
    };

    service = new SendService(
      mockSesClient,
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
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<abc123@us-east-1.amazonses.com>',
        envelope: { from: 'noreply@example.com', to: ['user@example.com'] },
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe(
        '<abc123@us-east-1.amazonses.com>',
      );
      expect(result.httpStatus).toBe(200);
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toBeNull();
    });

    it('should call sesClient.sendEmail with correct options', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'noreply@example.com', to: ['user@example.com'] },
      });

      await service.send(makeRequest());

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Notifications <noreply@example.com>',
          to: 'user@example.com',
          subject: 'Test Subject',
          html: '<p>Hello World</p>',
          headers: expect.objectContaining({
            'X-Notification-Id': 'notif-123',
            'X-Correlation-Id': 'corr-456',
            'X-Cycle-Id': 'cycle-789',
          }),
        }),
      );
    });

    it('should increment success metrics', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.send(makeRequest());

      expect(mockMetricsService.incrementSend).toHaveBeenCalledWith(
        'aws-ses',
        'email',
        'success',
      );
      expect(mockMetricsService.observeSendDuration).toHaveBeenCalledWith(
        'aws-ses',
        'email',
        expect.any(Number),
      );
    });
  });

  describe('Recipient name formatting', () => {
    it('should format "to" as "Name <email>" when name is present', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.send(
        makeRequest({
          recipient: { address: 'user@example.com', name: 'John Doe' },
        }),
      );

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'John Doe <user@example.com>',
        }),
      );
    });

    it('should use plain email when no name', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.send(makeRequest());

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
        }),
      );
    });
  });

  describe('Content handling', () => {
    it('should use htmlBody when provided', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
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

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<h1>HTML Body</h1>',
        }),
      );
    });

    it('should detect HTML in body and use html field', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.send(
        makeRequest({
          content: { subject: 'Test', body: '<p>HTML content</p>' },
        }),
      );

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<p>HTML content</p>',
        }),
      );
    });

    it('should use text field for plain text body', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.send(
        makeRequest({
          content: { subject: 'Test', body: 'Just plain text, no HTML' },
        }),
      );

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Just plain text, no HTML',
        }),
      );
    });
  });

  describe('Custom headers', () => {
    it('should include notificationId, correlationId, cycleId as X-headers', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.send(makeRequest());

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Notification-Id': 'notif-123',
            'X-Correlation-Id': 'corr-456',
            'X-Cycle-Id': 'cycle-789',
          }),
        }),
      );
    });

    it('should omit optional headers when not provided', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.send(
        makeRequest({
          metadata: { notificationId: 'notif-123' },
        }),
      );

      const callArgs = mockSesClient.sendEmail.mock.calls[0][0];
      expect(callArgs.headers['X-Notification-Id']).toBe('notif-123');
      expect(callArgs.headers['X-Correlation-Id']).toBeUndefined();
      expect(callArgs.headers['X-Cycle-Id']).toBeUndefined();
    });
  });

  describe('Channel validation', () => {
    it('should reject SMS channel', async () => {
      const result = await service.send(
        makeRequest({ channel: ChannelType.SMS }),
      );

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toContain('sms');
      expect(result.httpStatus).toBe(400);
      expect(mockSesClient.sendEmail).not.toHaveBeenCalled();
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

      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
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

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: 'report.pdf',
              contentType: 'application/pdf',
              content: expect.any(Buffer),
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

      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
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

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
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

      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
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
      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [],
        }),
      );
    });
  });

  describe('Error handling — SES SMTP errors', () => {
    it('should classify auth error as non-retryable', async () => {
      const smtpError = new Error('Invalid login') as any;
      smtpError.code = 'EAUTH';
      mockSesClient.sendEmail.mockRejectedValue(smtpError);

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: false,
        errorMessage: 'SES authentication failed',
        httpStatus: 401,
        errorCode: 'SES-004',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.httpStatus).toBe(401);
    });

    it('should classify network error as retryable', async () => {
      const networkError = new Error('connect ECONNREFUSED') as any;
      networkError.code = 'ECONNREFUSED';
      mockSesClient.sendEmail.mockRejectedValue(networkError);

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: true,
        errorMessage: 'Network error: connect ECONNREFUSED',
        httpStatus: 503,
        errorCode: 'SES-002',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });

    it('should classify throttling as retryable', async () => {
      const throttleError = new Error('Maximum sending rate exceeded');
      mockSesClient.sendEmail.mockRejectedValue(throttleError);

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: true,
        errorMessage: 'SES rate limit exceeded',
        httpStatus: 429,
        errorCode: 'SES-006',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.httpStatus).toBe(429);
    });

    it('should classify timeout as retryable', async () => {
      const timeoutError = new Error('Connection timeout') as any;
      timeoutError.code = 'ETIMEDOUT';
      mockSesClient.sendEmail.mockRejectedValue(timeoutError);

      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: true,
        errorMessage: 'Connection timeout',
        httpStatus: 503,
        errorCode: 'SES-002',
      });

      const result = await service.send(makeRequest());

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });
  });

  describe('Error metrics', () => {
    it('should increment failure metrics on error', async () => {
      mockSesClient.sendEmail.mockRejectedValue(new Error('SMTP error'));
      mockErrorClassifier.classifyError.mockReturnValue({
        retryable: false,
        errorMessage: 'Failed',
        httpStatus: 500,
        errorCode: 'SES-003',
      });

      await service.send(makeRequest());

      expect(mockMetricsService.incrementSend).toHaveBeenCalledWith(
        'aws-ses',
        'email',
        'failure',
      );
      expect(mockMetricsService.observeSendDuration).toHaveBeenCalledWith(
        'aws-ses',
        'email',
        expect.any(Number),
      );
      expect(mockMetricsService.incrementSendErrors).toHaveBeenCalledWith(
        'aws-ses',
        'email',
        'SES-003',
      );
    });
  });

  describe('fromAddress override', () => {
    it('should use request fromAddress when provided', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.send(
        makeRequest({ fromAddress: 'custom@example.com' }),
      );

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'custom@example.com',
        }),
      );
    });

    it('should use default fromAddress with fromName when not provided', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.send(makeRequest());

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Notifications <noreply@example.com>',
        }),
      );
    });
  });

  describe('replyTo', () => {
    it('should include replyTo when set', async () => {
      mockSesClient.sendEmail.mockResolvedValue({
        messageId: '<test@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.send(
        makeRequest({ replyTo: 'reply@example.com' }),
      );

      expect(mockSesClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'reply@example.com',
        }),
      );
    });
  });
});
