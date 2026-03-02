import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosError, AxiosHeaders } from 'axios';
import { TemplateClientService } from './template-client.service.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';
import { createErrorResponse } from '../common/errors.js';

describe('TemplateClientService', () => {
  let service: TemplateClientService;
  let httpService: jest.Mocked<HttpService>;
  let circuitBreakerService: jest.Mocked<CircuitBreakerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateClientService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
        {
          provide: CircuitBreakerService,
          useValue: {
            execute: jest.fn((fn: () => Promise<any>) => fn()),
          },
        },
      ],
    }).compile();

    service = module.get<TemplateClientService>(TemplateClientService);
    httpService = module.get(HttpService);
    circuitBreakerService = module.get(CircuitBreakerService);

    // Speed up tests by removing delays
    jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);
  });

  const mockServiceResponse = {
    rendered: {
      subject: 'Order Confirmed',
      body: '<p>Your order #12345 has been confirmed</p>',
    },
    metadata: {
      templateId: 'tpl-order-confirm',
      versionNumber: 3,
      channel: 'email',
      renderedAt: '2026-02-25T00:00:00.000Z',
      renderDurationMs: 50,
    },
    channelMetadata: { metaTemplateName: 'order_confirm' },
    warnings: [],
  };

  const expectedRenderResult = {
    channel: 'email',
    subject: 'Order Confirmed',
    body: '<p>Your order #12345 has been confirmed</p>',
    templateVersion: 3,
    templateId: 'tpl-order-confirm',
    channelMetadata: { metaTemplateName: 'order_confirm' },
  };

  const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

  const createAxiosError = (status: number, code?: string): AxiosError => {
    const error = new Error('Request failed') as AxiosError;
    error.isAxiosError = true;
    error.code = code;
    if (status > 0) {
      error.response = {
        status,
        statusText: status === 404 ? 'Not Found' : 'Internal Server Error',
        data: {},
        headers: {},
        config: { headers: new AxiosHeaders() },
      };
    }
    return error;
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('render', () => {
    it('should render template successfully', async () => {
      httpService.post.mockReturnValue(
        of(createAxiosResponse(mockServiceResponse)),
      );

      const result = await service.render('tpl-order-confirm', 'email', {
        orderId: '12345',
      });

      expect(result).toEqual(expectedRenderResult);
      expect(httpService.post).toHaveBeenCalledWith(
        '/api/v1/templates/tpl-order-confirm/render',
        { channel: 'email', data: { orderId: '12345' } },
      );
    });

    it('should throw NES-019 when template not found (404)', async () => {
      httpService.post.mockReturnValue(throwError(() => createAxiosError(404)));

      try {
        await service.render('nonexistent', 'email', {});
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-019');
        expect(response.message).toContain('nonexistent');
      }

      // Should not retry on 404
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx error and succeed', async () => {
      httpService.post
        .mockReturnValueOnce(throwError(() => createAxiosError(500)))
        .mockReturnValueOnce(of(createAxiosResponse(mockServiceResponse)));

      const result = await service.render('tpl-1', 'email', {});

      expect(result).toEqual(expectedRenderResult);
      expect(httpService.post).toHaveBeenCalledTimes(2);
    });

    it('should retry on timeout and succeed', async () => {
      httpService.post
        .mockReturnValueOnce(
          throwError(() => createAxiosError(0, 'ECONNABORTED')),
        )
        .mockReturnValueOnce(of(createAxiosResponse(mockServiceResponse)));

      const result = await service.render('tpl-1', 'email', {});

      expect(result).toEqual(expectedRenderResult);
      expect(httpService.post).toHaveBeenCalledTimes(2);
    });

    it('should throw NES-018 after exhausting retries on 5xx', async () => {
      httpService.post.mockReturnValue(throwError(() => createAxiosError(503)));

      try {
        await service.render('tpl-1', 'email', {});
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-018');
      }

      expect(httpService.post).toHaveBeenCalledTimes(3);
    });

    it('should throw NES-018 after exhausting retries on timeout', async () => {
      httpService.post.mockReturnValue(
        throwError(() => createAxiosError(0, 'ETIMEDOUT')),
      );

      try {
        await service.render('tpl-1', 'email', {});
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-018');
      }

      expect(httpService.post).toHaveBeenCalledTimes(3);
    });

    it('should throw NES-018 on non-retryable client error (not 404)', async () => {
      httpService.post.mockReturnValue(throwError(() => createAxiosError(400)));

      try {
        await service.render('tpl-1', 'email', {});
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-018');
      }

      // Should not retry on 4xx (except 404 which throws NES-019)
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });

    it('should pass channel and data in request body', async () => {
      httpService.post.mockReturnValue(
        of(createAxiosResponse(mockServiceResponse)),
      );

      await service.render('tpl-1', 'sms', {
        name: 'John',
        orderId: '999',
      });

      expect(httpService.post).toHaveBeenCalledWith('/api/v1/templates/tpl-1/render', {
        channel: 'sms',
        data: { name: 'John', orderId: '999' },
      });
    });

    it('should delegate to circuit breaker execute', async () => {
      httpService.post.mockReturnValue(
        of(createAxiosResponse(mockServiceResponse)),
      );

      await service.render('tpl-1', 'email', {});

      expect(circuitBreakerService.execute).toHaveBeenCalledTimes(1);
    });

    it('should parse channelMetadata from template-service response', async () => {
      const responseWithMetadata = {
        ...mockServiceResponse,
        channelMetadata: {
          metaTemplateName: 'order_delay',
          metaTemplateLanguage: 'es_MX',
          metaTemplateParameters: [{ name: 'customer_name', field: 'customerName' }, { name: 'order_id', field: 'orderId' }],
        },
      };

      httpService.post.mockReturnValue(
        of(createAxiosResponse(responseWithMetadata)),
      );

      const result = await service.render('tpl-1', 'whatsapp', {});

      expect(result.channelMetadata).toEqual({
        metaTemplateName: 'order_delay',
        metaTemplateLanguage: 'es_MX',
        metaTemplateParameters: [{ name: 'customer_name', field: 'customerName' }, { name: 'order_id', field: 'orderId' }],
      });
    });

    it('should return undefined channelMetadata when template-service does not include it', async () => {
      const responseWithoutMetadata = {
        rendered: mockServiceResponse.rendered,
        metadata: mockServiceResponse.metadata,
        warnings: [],
      };

      httpService.post.mockReturnValue(
        of(createAxiosResponse(responseWithoutMetadata)),
      );

      const result = await service.render('tpl-1', 'email', {});

      expect(result.channelMetadata).toBeUndefined();
    });

    it('should propagate NES-020 when circuit breaker is open', async () => {
      circuitBreakerService.execute.mockRejectedValue(
        createErrorResponse('NES-020'),
      );

      try {
        await service.render('tpl-1', 'email', {});
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-020');
      }

      // httpService.post should not be called when circuit is open
      expect(httpService.post).not.toHaveBeenCalled();
    });
  });
});
