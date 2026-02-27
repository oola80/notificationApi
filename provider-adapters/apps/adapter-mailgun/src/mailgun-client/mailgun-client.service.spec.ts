import { MailgunClientService } from './mailgun-client.service.js';
import { of, throwError } from 'rxjs';
import FormData from 'form-data';

describe('MailgunClientService', () => {
  let service: MailgunClientService;
  let mockHttpService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn((key: string, def?: any) => {
        const values: Record<string, any> = {
          'mailgun.apiKey': 'test-api-key-123',
          'mailgun.domain': 'distelsa.info',
          'mailgun.baseUrl': 'https://api.mailgun.net/v3',
        };
        return values[key] ?? def;
      }),
    };
    service = new MailgunClientService(mockHttpService, mockConfigService);
  });

  describe('sendMessage', () => {
    it('should POST to correct Mailgun URL with form data', async () => {
      const formData = new FormData();
      formData.append('to', 'test@example.com');

      mockHttpService.post.mockReturnValue(
        of({
          data: {
            id: '<20230101120000.abc123@distelsa.info>',
            message: 'Queued. Thank you.',
          },
        }),
      );

      const result = await service.sendMessage(formData);

      expect(result.id).toBe('<20230101120000.abc123@distelsa.info>');
      expect(result.message).toBe('Queued. Thank you.');
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.mailgun.net/v3/distelsa.info/messages',
        formData,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
          timeout: 10000,
        }),
      );
    });

    it('should use correct Basic Auth header', async () => {
      const formData = new FormData();
      mockHttpService.post.mockReturnValue(
        of({
          data: { id: '<test@distelsa.info>', message: 'Queued.' },
        }),
      );

      await service.sendMessage(formData);

      const expectedAuth =
        'Basic ' + Buffer.from('api:test-api-key-123').toString('base64');
      const callArgs = mockHttpService.post.mock.calls[0];
      expect(callArgs[2].headers.Authorization).toBe(expectedAuth);
    });

    it('should propagate errors from Mailgun API', async () => {
      const formData = new FormData();
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const err = new Error('Request failed') as any;
          err.isAxiosError = true;
          err.response = { status: 401, data: { message: 'Unauthorized' } };
          return err;
        }),
      );

      await expect(service.sendMessage(formData)).rejects.toThrow(
        'Request failed',
      );
    });

    it('should handle 200 success response', async () => {
      const formData = new FormData();
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            id: '<msg-id@distelsa.info>',
            message: 'Queued. Thank you.',
          },
        }),
      );

      const result = await service.sendMessage(formData);

      expect(result).toEqual({
        id: '<msg-id@distelsa.info>',
        message: 'Queued. Thank you.',
      });
    });
  });

  describe('getDomainInfo', () => {
    it('should GET correct Mailgun domains URL', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: { domain: { name: 'distelsa.info', state: 'active' } },
        }),
      );

      const result = await service.getDomainInfo();

      expect(result.domain.state).toBe('active');
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://api.mailgun.net/v3/domains/distelsa.info',
        expect.objectContaining({
          auth: { username: 'api', password: 'test-api-key-123' },
          timeout: 5000,
        }),
      );
    });
  });

  describe('EU region support', () => {
    it('should use EU base URL when configured', () => {
      const euConfigService = {
        get: jest.fn((key: string, def?: any) => {
          const values: Record<string, any> = {
            'mailgun.apiKey': 'eu-key',
            'mailgun.domain': 'distelsa.info',
            'mailgun.baseUrl': 'https://api.eu.mailgun.net/v3',
          };
          return values[key] ?? def;
        }),
      } as any;

      const euService = new MailgunClientService(
        mockHttpService,
        euConfigService,
      );

      expect(euService.getBaseUrl()).toBe('https://api.eu.mailgun.net/v3');
    });
  });

  describe('buildFormData', () => {
    it('should build form data with all fields', () => {
      const formData = service.buildFormData({
        from: 'sender@distelsa.info',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        headers: { 'X-Notification-Id': 'notif-123' },
        customVariables: { notificationId: 'notif-123', cycleId: 'cycle-1' },
        attachments: [
          {
            filename: 'file.pdf',
            contentType: 'application/pdf',
            data: Buffer.from('pdf-content'),
          },
        ],
      });

      expect(formData).toBeInstanceOf(FormData);
    });

    it('should use text field when no HTML provided', () => {
      const formData = service.buildFormData({
        from: 'sender@distelsa.info',
        to: 'recipient@example.com',
        text: 'Plain text body',
      });

      expect(formData).toBeInstanceOf(FormData);
    });

    it('should include custom variable prefixes', () => {
      const formData = service.buildFormData({
        from: 'sender@distelsa.info',
        to: 'recipient@example.com',
        html: '<p>body</p>',
        customVariables: {
          notificationId: 'n-1',
          correlationId: 'c-1',
        },
      });

      expect(formData).toBeInstanceOf(FormData);
    });
  });

  describe('getBaseUrl / getDomain', () => {
    it('should return configured base URL', () => {
      expect(service.getBaseUrl()).toBe('https://api.mailgun.net/v3');
    });

    it('should return configured domain', () => {
      expect(service.getDomain()).toBe('distelsa.info');
    });
  });
});
