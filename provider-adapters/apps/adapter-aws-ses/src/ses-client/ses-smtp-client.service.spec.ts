import { SesSmtpClientService } from './ses-smtp-client.service.js';

describe('SesSmtpClientService', () => {
  let service: SesSmtpClientService;
  let mockConfigService: any;
  let mockTransporter: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string, def?: any) => {
        const values: Record<string, any> = {
          'ses.smtpHost': 'email-smtp.us-east-1.amazonaws.com',
          'ses.smtpPort': 587,
          'ses.smtpUsername': 'AKIA_TEST_USERNAME',
          'ses.smtpPassword': 'test-smtp-password',
          'ses.timeoutMs': 10000,
        };
        return values[key] ?? def;
      }),
    };

    service = new SesSmtpClientService(mockConfigService);

    // Mock the transporter after construction
    mockTransporter = {
      sendMail: jest.fn(),
      verify: jest.fn(),
    };
    (service as any).transporter = mockTransporter;
  });

  describe('sendEmail', () => {
    it('should send email and return messageId and envelope', async () => {
      mockTransporter.sendMail.mockResolvedValue({
        messageId: '<abc123@us-east-1.amazonses.com>',
        envelope: {
          from: 'noreply@example.com',
          to: ['user@example.com'],
        },
      });

      const result = await service.sendEmail({
        from: 'noreply@example.com',
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      });

      expect(result.messageId).toBe('<abc123@us-east-1.amazonses.com>');
      expect(result.envelope.from).toBe('noreply@example.com');
      expect(result.envelope.to).toEqual(['user@example.com']);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@example.com',
          to: 'user@example.com',
          subject: 'Test Subject',
          html: '<p>Hello</p>',
        }),
      );
    });

    it('should pass text content when no html', async () => {
      mockTransporter.sendMail.mockResolvedValue({
        messageId: '<abc@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.sendEmail({
        from: 'a@b.com',
        to: 'c@d.com',
        subject: 'Test',
        text: 'Plain text body',
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Plain text body',
        }),
      );
    });

    it('should include attachments in mail options', async () => {
      mockTransporter.sendMail.mockResolvedValue({
        messageId: '<abc@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      const content = Buffer.from('file content');

      await service.sendEmail({
        from: 'a@b.com',
        to: 'c@d.com',
        subject: 'Test',
        html: '<p>See attached</p>',
        attachments: [
          {
            filename: 'report.pdf',
            contentType: 'application/pdf',
            content,
          },
        ],
      });

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.attachments).toHaveLength(1);
      expect(callArgs.attachments[0].filename).toBe('report.pdf');
      expect(callArgs.attachments[0].contentType).toBe('application/pdf');
      expect(callArgs.attachments[0].content).toBe(content);
    });

    it('should include replyTo when provided', async () => {
      mockTransporter.sendMail.mockResolvedValue({
        messageId: '<abc@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.sendEmail({
        from: 'a@b.com',
        to: 'c@d.com',
        subject: 'Test',
        html: '<p>Body</p>',
        replyTo: 'reply@example.com',
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'reply@example.com',
        }),
      );
    });

    it('should include custom headers', async () => {
      mockTransporter.sendMail.mockResolvedValue({
        messageId: '<abc@ses.com>',
        envelope: { from: 'a@b.com', to: ['c@d.com'] },
      });

      await service.sendEmail({
        from: 'a@b.com',
        to: 'c@d.com',
        subject: 'Test',
        html: '<p>Body</p>',
        headers: {
          'X-Notification-Id': 'notif-123',
          'X-Correlation-Id': 'corr-456',
        },
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'X-Notification-Id': 'notif-123',
            'X-Correlation-Id': 'corr-456',
          },
        }),
      );
    });

    it('should propagate errors from transporter', async () => {
      mockTransporter.sendMail.mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(
        service.sendEmail({
          from: 'a@b.com',
          to: 'c@d.com',
          subject: 'Test',
          html: '<p>Body</p>',
        }),
      ).rejects.toThrow('Connection refused');
    });

    it('should handle envelope.to as string', async () => {
      mockTransporter.sendMail.mockResolvedValue({
        messageId: '<abc@ses.com>',
        envelope: { from: 'a@b.com', to: 'c@d.com' },
      });

      const result = await service.sendEmail({
        from: 'a@b.com',
        to: 'c@d.com',
        subject: 'Test',
        html: '<p>Body</p>',
      });

      expect(result.envelope.to).toEqual(['c@d.com']);
    });
  });

  describe('verifyConnection', () => {
    it('should return true when transporter.verify succeeds', async () => {
      mockTransporter.verify.mockResolvedValue(true);

      const result = await service.verifyConnection();

      expect(result).toBe(true);
      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    it('should return false when transporter.verify fails', async () => {
      mockTransporter.verify.mockRejectedValue(new Error('Auth failed'));

      const result = await service.verifyConnection();

      expect(result).toBe(false);
    });
  });

  describe('getSmtpHost', () => {
    it('should return configured SMTP host', () => {
      expect(service.getSmtpHost()).toBe(
        'email-smtp.us-east-1.amazonaws.com',
      );
    });
  });
});
