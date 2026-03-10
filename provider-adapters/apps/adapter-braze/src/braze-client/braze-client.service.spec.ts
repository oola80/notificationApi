import { BrazeClientService } from './braze-client.service.js';
import { of, throwError } from 'rxjs';

describe('BrazeClientService', () => {
  let service: BrazeClientService;
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
          'braze.restEndpoint': 'https://rest.iad-01.braze.com',
          'braze.apiKey': 'test-api-key',
        };
        return values[key] ?? def;
      }),
    };

    service = new BrazeClientService(mockHttpService, mockConfigService);
  });

  describe('sendMessage', () => {
    it('should POST to /messages/send with correct auth header', async () => {
      const payload = {
        external_user_ids: ['hash123'],
        messages: {
          email: {
            app_id: 'app-123',
            subject: 'Test',
            body: '<p>Hello</p>',
            from: 'Notifications <noreply@example.com>',
          },
        },
      };

      mockHttpService.post.mockReturnValue(
        of({
          data: {
            dispatch_id: 'dispatch-abc',
            errors: [],
            message: 'success',
          },
        }),
      );

      const result = await service.sendMessage(payload);

      expect(result.dispatch_id).toBe('dispatch-abc');
      expect(result.message).toBe('success');
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://rest.iad-01.braze.com/messages/send',
        payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should throw when response contains errors array', async () => {
      const payload = {
        external_user_ids: ['hash123'],
        messages: { email: { app_id: 'app-123', subject: 'Test', body: 'Hi', from: 'a' } },
      };

      mockHttpService.post.mockReturnValue(
        of({
          data: {
            dispatch_id: 'dispatch-abc',
            errors: [{ type: 'error', message: 'No valid users' }],
            message: 'success',
          },
        }),
      );

      await expect(service.sendMessage(payload)).rejects.toThrow(
        'Braze send returned errors',
      );
    });

    it('should propagate HTTP errors', async () => {
      const payload = {
        external_user_ids: ['hash123'],
        messages: { email: { app_id: 'app-123', subject: 'Test', body: 'Hi', from: 'a' } },
      };

      const error = new Error('Request failed') as any;
      error.isAxiosError = true;
      error.response = { status: 401 };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(service.sendMessage(payload)).rejects.toThrow(
        'Request failed',
      );
    });

    it('should handle timeout errors', async () => {
      const payload = {
        external_user_ids: ['hash123'],
        messages: { email: { app_id: 'app-123', subject: 'Test', body: 'Hi', from: 'a' } },
      };

      const error = new Error('timeout of 10000ms exceeded') as any;
      error.code = 'ECONNABORTED';
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(service.sendMessage(payload)).rejects.toThrow('timeout');
    });
  });

  describe('trackUser', () => {
    it('should POST to /users/track with correct payload', async () => {
      const payload = {
        attributes: [
          {
            external_id: 'hash123',
            email: 'user@example.com',
          },
        ],
      };

      mockHttpService.post.mockReturnValue(
        of({
          data: {
            message: 'success',
            attributes_processed: 1,
          },
        }),
      );

      const result = await service.trackUser(payload);

      expect(result.message).toBe('success');
      expect(result.attributes_processed).toBe(1);
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://rest.iad-01.braze.com/users/track',
        payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        }),
      );
    });

    it('should propagate errors from track call', async () => {
      const payload = {
        attributes: [{ external_id: 'hash123', email: 'user@example.com' }],
      };

      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Track failed')),
      );

      await expect(service.trackUser(payload)).rejects.toThrow('Track failed');
    });
  });
});
