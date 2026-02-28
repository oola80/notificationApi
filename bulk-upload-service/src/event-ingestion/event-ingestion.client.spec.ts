import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosError, AxiosHeaders } from 'axios';
import {
  EventIngestionClient,
  SubmitEventPayload,
} from './event-ingestion.client.js';

describe('EventIngestionClient', () => {
  let client: EventIngestionClient;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;

  const mockPayload: SubmitEventPayload = {
    sourceId: 'bulk-upload',
    cycleId: 'upload-123',
    eventType: 'order.created',
    sourceEventId: 'upload-123-row-1',
    timestamp: '2026-02-27T10:00:00.000Z',
    payload: {
      email: 'test@example.com',
      orderId: 'ORD-001',
    },
  };

  beforeEach(() => {
    httpService = {
      post: jest.fn(),
    } as any;

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'app.eventIngestionUrl': 'http://localhost:3151',
          'app.workerRequestTimeoutMs': 10000,
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    client = new EventIngestionClient(httpService, configService);
  });

  describe('submitEvent', () => {
    it('should return success for 200 response', async () => {
      const response: AxiosResponse = {
        data: { eventId: 'evt-001' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };
      httpService.post.mockReturnValue(of(response));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt-001');
      expect(result.statusCode).toBe(200);
    });

    it('should return success for 201 response', async () => {
      const response: AxiosResponse = {
        data: { eventId: 'evt-002' },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };
      httpService.post.mockReturnValue(of(response));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt-002');
    });

    it('should return success for 202 response', async () => {
      const response: AxiosResponse = {
        data: { id: 'evt-003' },
        status: 202,
        statusText: 'Accepted',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };
      httpService.post.mockReturnValue(of(response));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('evt-003');
    });

    it('should handle 400 error with validation message', async () => {
      const error = {
        response: {
          status: 400,
          data: { message: 'Invalid event type' },
        },
        code: undefined,
        message: 'Request failed with status code 400',
      };
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid event type');
      expect(result.statusCode).toBe(400);
    });

    it('should handle 422 error with details', async () => {
      const error = {
        response: {
          status: 422,
          data: { details: 'No mapping found' },
        },
        code: undefined,
        message: 'Request failed with status code 422',
      };
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No mapping found');
      expect(result.statusCode).toBe(422);
    });

    it('should handle 500 error', async () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
        code: undefined,
        message: 'Request failed with status code 500',
      };
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP 500 error');
      expect(result.statusCode).toBe(500);
    });

    it('should handle timeout error', async () => {
      const error = {
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded',
        response: undefined,
      };
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('timeout after 10000ms');
      expect(result.statusCode).toBe(408);
    });

    it('should handle ETIMEDOUT error', async () => {
      const error = {
        code: 'ETIMEDOUT',
        message: 'connect ETIMEDOUT',
        response: undefined,
      };
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('timeout after 10000ms');
    });

    it('should handle connection refused error', async () => {
      const error = {
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:3151',
        response: undefined,
      };
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('connection refused');
      expect(result.statusCode).toBe(503);
    });

    it('should handle ENOTFOUND error', async () => {
      const error = {
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND localhost',
        response: undefined,
      };
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('connection refused');
    });

    it('should handle unknown error', async () => {
      const error = {
        message: 'Something unexpected happened',
        response: undefined,
        code: undefined,
      };
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something unexpected happened');
      expect(result.statusCode).toBe(500);
    });

    it('should call correct URL with timeout', async () => {
      const response: AxiosResponse = {
        data: { eventId: 'evt-001' },
        status: 202,
        statusText: 'Accepted',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };
      httpService.post.mockReturnValue(of(response));

      await client.submitEvent(mockPayload);

      expect(httpService.post).toHaveBeenCalledWith(
        'http://localhost:3151/webhooks/events',
        mockPayload,
        { timeout: 10000 },
      );
    });

    it('should handle 4xx error with fallback message', async () => {
      const error = {
        response: {
          status: 404,
          data: {},
        },
        code: undefined,
        message: 'Request failed with status code 404',
      };
      httpService.post.mockReturnValue(throwError(() => error));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP 404 error');
      expect(result.statusCode).toBe(404);
    });

    it('should handle response with id field instead of eventId', async () => {
      const response: AxiosResponse = {
        data: { id: 'some-id' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };
      httpService.post.mockReturnValue(of(response));

      const result = await client.submitEvent(mockPayload);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe('some-id');
    });
  });
});
