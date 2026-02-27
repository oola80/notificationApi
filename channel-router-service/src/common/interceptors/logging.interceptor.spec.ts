import { ExecutionContext, CallHandler } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor.js';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockLogger: {
    setContext: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };

  beforeEach(() => {
    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    interceptor = new LoggingInterceptor(mockLogger as unknown as PinoLogger);
  });

  function createHttpContext(
    method: string,
    url: string,
    statusCode: number,
    headers: Record<string, string> = {},
  ): ExecutionContext {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          url,
          headers,
          body: {},
        }),
        getResponse: () => ({
          statusCode,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should log info for successful 2xx requests', (done) => {
    const context = createHttpContext('GET', '/health', 200);
    const next: CallHandler = { handle: () => of('result') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLogger.info).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log warn for 4xx errors', (done) => {
    const context = createHttpContext('POST', '/channels', 400);
    const error = { status: 400, getStatus: () => 400 };
    const next: CallHandler = { handle: () => throwError(() => error) };

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expect(mockLogger.warn).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log error for 5xx errors', (done) => {
    const context = createHttpContext('POST', '/delivery', 500);
    const error = { status: 500, getStatus: () => 500 };
    const next: CallHandler = { handle: () => throwError(() => error) };

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expect(mockLogger.error).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should extract correlationId from headers', (done) => {
    const context = createHttpContext('GET', '/health', 200, {
      'x-correlation-id': 'test-corr-id',
    });
    const next: CallHandler = { handle: () => of('result') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({ correlationId: 'test-corr-id' }),
          expect.any(String),
        );
        done();
      },
    });
  });

  it('should pass through non-http contexts', (done) => {
    const context = {
      getType: () => 'rpc',
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('result') };

    interceptor.intercept(context, next).subscribe({
      next: (value) => {
        expect(value).toBe('result');
      },
      complete: () => {
        expect(mockLogger.info).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should include durationMs in log context', (done) => {
    const context = createHttpContext('GET', '/metrics', 200);
    const next: CallHandler = { handle: () => of('result') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            durationMs: expect.any(Number),
          }),
          expect.any(String),
        );
        done();
      },
    });
  });
});
