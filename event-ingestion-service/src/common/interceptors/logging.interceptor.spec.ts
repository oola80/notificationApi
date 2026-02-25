import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { LoggingInterceptor } from './logging.interceptor.js';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockLogger: jest.Mocked<PinoLogger>;
  let mockContext: ExecutionContext;
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(async () => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingInterceptor,
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    interceptor = module.get<LoggingInterceptor>(LoggingInterceptor);

    mockRequest = {
      method: 'GET',
      url: '/test',
      headers: {},
      body: {},
    };
    mockResponse = { statusCode: 200 };
    mockContext = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  });

  it('should log info for successful requests', (done) => {
    const handler: CallHandler = { handle: () => of('result') };

    interceptor.intercept(mockContext, handler).subscribe({
      complete: () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'GET',
            url: '/test',
            statusCode: 200,
            durationMs: expect.any(Number),
          }),
          expect.stringContaining('GET /test 200'),
        );
        done();
      },
    });
  });

  it('should log warn for 4xx responses', (done) => {
    mockResponse.statusCode = 404;
    const handler: CallHandler = { handle: () => of('result') };

    interceptor.intercept(mockContext, handler).subscribe({
      complete: () => {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 404,
          }),
          expect.stringContaining('GET /test 404'),
        );
        done();
      },
    });
  });

  it('should log error for 5xx responses', (done) => {
    mockResponse.statusCode = 500;
    const handler: CallHandler = { handle: () => of('result') };

    interceptor.intercept(mockContext, handler).subscribe({
      complete: () => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 500,
          }),
          expect.stringContaining('GET /test 500'),
        );
        done();
      },
    });
  });

  it('should log warn for error responses with 4xx status', (done) => {
    const error = { status: 400, getStatus: () => 400 };
    const handler: CallHandler = { handle: () => throwError(() => error) };

    interceptor.intercept(mockContext, handler).subscribe({
      error: () => {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 400,
          }),
          expect.stringContaining('GET /test 400'),
        );
        done();
      },
    });
  });

  it('should log error for error responses with 5xx status', (done) => {
    const error = { status: 500, getStatus: () => 500 };
    const handler: CallHandler = { handle: () => throwError(() => error) };

    interceptor.intercept(mockContext, handler).subscribe({
      error: () => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 500,
          }),
          expect.stringContaining('GET /test 500'),
        );
        done();
      },
    });
  });

  it('should include correlationId from x-request-id header', (done) => {
    mockRequest.headers['x-request-id'] = 'corr-123';
    const handler: CallHandler = { handle: () => of('result') };

    interceptor.intercept(mockContext, handler).subscribe({
      complete: () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId: 'corr-123',
          }),
          expect.any(String),
        );
        done();
      },
    });
  });

  it('should include sourceId from request body', (done) => {
    mockRequest.body = { sourceId: 'shopify' };
    const handler: CallHandler = { handle: () => of('result') };

    interceptor.intercept(mockContext, handler).subscribe({
      complete: () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceId: 'shopify',
          }),
          expect.any(String),
        );
        done();
      },
    });
  });

  it('should pass through without logging for non-HTTP contexts', (done) => {
    const rpcContext = {
      getType: () => 'rpc',
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => of('result') };

    interceptor.intercept(rpcContext, handler).subscribe({
      complete: () => {
        expect(mockLogger.info).not.toHaveBeenCalled();
        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should include method, URL, statusCode, and durationMs in log context', (done) => {
    const handler: CallHandler = { handle: () => of('result') };

    interceptor.intercept(mockContext, handler).subscribe({
      complete: () => {
        const logContext = mockLogger.info.mock.calls[0][0] as any;
        expect(logContext).toHaveProperty('method', 'GET');
        expect(logContext).toHaveProperty('url', '/test');
        expect(logContext).toHaveProperty('statusCode', 200);
        expect(logContext).toHaveProperty('durationMs');
        expect(typeof logContext.durationMs).toBe('number');
        done();
      },
    });
  });
});
