import { SesApiClientService } from './ses-api-client.service.js';

// Mock the AWS SDK
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  SendEmailCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetAccountCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe('SesApiClientService', () => {
  let service: SesApiClientService;
  let mockConfigService: any;

  beforeEach(() => {
    mockSend.mockReset();
    mockConfigService = {
      get: jest.fn((key: string, def?: any) => {
        const values: Record<string, any> = {
          'ses.region': 'us-east-1',
          'ses.accessKeyId': 'AKIA_TEST',
          'ses.secretAccessKey': 'test-secret',
          'ses.configurationSet': 'my-config-set',
          'ses.timeoutMs': 10000,
        };
        return values[key] ?? def;
      }),
    };

    service = new SesApiClientService(mockConfigService);
    service.onModuleInit();
  });

  describe('sendEmail — simple (no attachments)', () => {
    it('should send simple email with HTML body and return messageId', async () => {
      mockSend.mockResolvedValue({ MessageId: 'api-msg-001' });

      const result = await service.sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      });

      expect(result.messageId).toBe('api-msg-001');
      expect(mockSend).toHaveBeenCalledTimes(1);

      const command = mockSend.mock.calls[0][0];
      expect(command.input.FromEmailAddress).toBe('sender@example.com');
      expect(command.input.Destination.ToAddresses).toEqual([
        'recipient@example.com',
      ]);
      expect(command.input.Content.Simple.Subject.Data).toBe('Test Subject');
      expect(command.input.Content.Simple.Body.Html.Data).toBe('<p>Hello</p>');
      expect(command.input.ConfigurationSetName).toBe('my-config-set');
    });

    it('should send simple email with text body', async () => {
      mockSend.mockResolvedValue({ MessageId: 'api-msg-002' });

      await service.sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Plain text body',
      });

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Content.Simple.Body.Text.Data).toBe(
        'Plain text body',
      );
    });

    it('should include replyTo addresses', async () => {
      mockSend.mockResolvedValue({ MessageId: 'api-msg-003' });

      await service.sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Body</p>',
        replyTo: 'reply@example.com',
      });

      const command = mockSend.mock.calls[0][0];
      expect(command.input.ReplyToAddresses).toEqual(['reply@example.com']);
    });

    it('should convert X-headers to EmailTags', async () => {
      mockSend.mockResolvedValue({ MessageId: 'api-msg-004' });

      await service.sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Body</p>',
        headers: {
          'X-Notification-Id': 'notif-123',
          'X-Correlation-Id': 'corr-456',
        },
      });

      const command = mockSend.mock.calls[0][0];
      expect(command.input.EmailTags).toEqual(
        expect.arrayContaining([
          { Name: 'NotificationId', Value: 'notif-123' },
          { Name: 'CorrelationId', Value: 'corr-456' },
        ]),
      );
    });

    it('should handle empty MessageId', async () => {
      mockSend.mockResolvedValue({});

      const result = await service.sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Body</p>',
      });

      expect(result.messageId).toBe('');
    });
  });

  describe('sendEmail — with attachments (raw MIME)', () => {
    it('should build raw MIME message with attachment', async () => {
      mockSend.mockResolvedValue({ MessageId: 'raw-msg-001' });

      const result = await service.sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'With Attachment',
        html: '<p>See attached</p>',
        attachments: [
          {
            filename: 'report.pdf',
            contentType: 'application/pdf',
            content: Buffer.from('PDF content'),
          },
        ],
      });

      expect(result.messageId).toBe('raw-msg-001');
      const command = mockSend.mock.calls[0][0];
      expect(command.input.Content.Raw).toBeDefined();
      expect(command.input.Content.Raw.Data).toBeInstanceOf(Buffer);

      const rawMessage = command.input.Content.Raw.Data.toString();
      expect(rawMessage).toContain('From: sender@example.com');
      expect(rawMessage).toContain('To: recipient@example.com');
      expect(rawMessage).toContain('Subject: With Attachment');
      expect(rawMessage).toContain('multipart/mixed');
      expect(rawMessage).toContain('text/html');
      expect(rawMessage).toContain('<p>See attached</p>');
      expect(rawMessage).toContain('application/pdf');
      expect(rawMessage).toContain('report.pdf');
      expect(rawMessage).toContain(
        Buffer.from('PDF content').toString('base64'),
      );
    });

    it('should include custom headers in raw MIME message', async () => {
      mockSend.mockResolvedValue({ MessageId: 'raw-msg-002' });

      await service.sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Body</p>',
        headers: { 'X-Notification-Id': 'notif-999' },
        attachments: [
          {
            filename: 'file.txt',
            contentType: 'text/plain',
            content: Buffer.from('text'),
          },
        ],
      });

      const rawMessage =
        mockSend.mock.calls[0][0].input.Content.Raw.Data.toString();
      expect(rawMessage).toContain('X-Notification-Id: notif-999');
    });

    it('should include configuration set in raw message', async () => {
      mockSend.mockResolvedValue({ MessageId: 'raw-msg-003' });

      await service.sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Body</p>',
        attachments: [
          {
            filename: 'file.txt',
            contentType: 'text/plain',
            content: Buffer.from('text'),
          },
        ],
      });

      const command = mockSend.mock.calls[0][0];
      expect(command.input.ConfigurationSetName).toBe('my-config-set');
    });
  });

  describe('sendEmail — no configuration set', () => {
    it('should not include ConfigurationSetName when not configured', async () => {
      const noConfigSetService = new SesApiClientService({
        get: jest.fn((key: string, def?: any) => {
          const values: Record<string, any> = {
            'ses.region': 'us-east-1',
            'ses.accessKeyId': 'AKIA_TEST',
            'ses.secretAccessKey': 'test-secret',
            'ses.configurationSet': '',
            'ses.timeoutMs': 10000,
          };
          return values[key] ?? def;
        }),
      } as any);
      noConfigSetService.onModuleInit();

      mockSend.mockResolvedValue({ MessageId: 'no-config-msg' });

      await noConfigSetService.sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Body</p>',
      });

      const command = mockSend.mock.calls[0][0];
      expect(command.input.ConfigurationSetName).toBeUndefined();
    });
  });

  describe('sendEmail — error propagation', () => {
    it('should propagate SDK errors', async () => {
      const sdkError = new Error('ThrottlingException') as any;
      sdkError.name = 'ThrottlingException';
      mockSend.mockRejectedValue(sdkError);

      await expect(
        service.sendEmail({
          from: 'sender@example.com',
          to: 'recipient@example.com',
          subject: 'Test',
          html: '<p>Body</p>',
        }),
      ).rejects.toThrow('ThrottlingException');
    });
  });

  describe('getAccountInfo', () => {
    it('should return account sending quota info', async () => {
      mockSend.mockResolvedValue({
        SendQuota: {
          MaxSendRate: 14,
          Max24HourSend: 50000,
          SentLast24Hours: 1234,
        },
        SendingEnabled: true,
      });

      const info = await service.getAccountInfo();

      expect(info.maxSendRate).toBe(14);
      expect(info.max24HourSend).toBe(50000);
      expect(info.sentLast24Hours).toBe(1234);
      expect(info.sendingEnabled).toBe(true);
    });

    it('should handle missing quota data with defaults', async () => {
      mockSend.mockResolvedValue({});

      const info = await service.getAccountInfo();

      expect(info.maxSendRate).toBe(0);
      expect(info.max24HourSend).toBe(0);
      expect(info.sentLast24Hours).toBe(0);
      expect(info.sendingEnabled).toBe(false);
    });

    it('should propagate errors from GetAccount', async () => {
      mockSend.mockRejectedValue(new Error('Access denied'));

      await expect(service.getAccountInfo()).rejects.toThrow('Access denied');
    });
  });

  describe('checkConnectivity', () => {
    it('should return ok=true when sending is enabled', async () => {
      mockSend.mockResolvedValue({
        SendQuota: {
          MaxSendRate: 14,
          Max24HourSend: 50000,
          SentLast24Hours: 100,
        },
        SendingEnabled: true,
      });

      const result = await service.checkConnectivity();

      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.details.mode).toBe('api');
      expect(result.details.region).toBe('us-east-1');
      expect(result.details.maxSendRate).toBe(14);
      expect(result.details.sendingEnabled).toBe(true);
    });

    it('should return ok=false when sending is disabled', async () => {
      mockSend.mockResolvedValue({
        SendQuota: {
          MaxSendRate: 0,
          Max24HourSend: 0,
          SentLast24Hours: 0,
        },
        SendingEnabled: false,
      });

      const result = await service.checkConnectivity();

      expect(result.ok).toBe(false);
      expect(result.details.sendingEnabled).toBe(false);
    });

    it('should return ok=false on error', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      const result = await service.checkConnectivity();

      expect(result.ok).toBe(false);
      expect(result.details.error).toBe('Network error');
      expect(result.details.mode).toBe('api');
    });
  });

  describe('getRegion', () => {
    it('should return configured region', () => {
      expect(service.getRegion()).toBe('us-east-1');
    });
  });
});
