import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor.js';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    interceptor = new LoggingInterceptor(mockLogger as any);
  });

  function createMockContext(
    statusCode: number,
    method = 'GET',
    url = '/test',
  ): ExecutionContext {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          url,
          headers: { 'x-correlation-id': 'test-corr-id' },
        }),
        getResponse: () => ({ statusCode }),
      }),
    } as any;
  }

  function createCallHandler(result: any = {}): CallHandler {
    return { handle: () => of(result) };
  }

  it('should log info for 2xx responses', (done) => {
    const context = createMockContext(200);
    const handler = createCallHandler();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(mockLogger.info).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log warn for 4xx responses', (done) => {
    const context = createMockContext(404);
    const handler = createCallHandler();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(mockLogger.warn).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log error for 5xx responses', (done) => {
    const context = createMockContext(500);
    const handler = createCallHandler();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(mockLogger.error).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log error when handler throws 5xx error', (done) => {
    const context = createMockContext(200);
    const handler: CallHandler = {
      handle: () => throwError(() => ({ status: 500 })),
    };

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(mockLogger.error).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log warn when handler throws 4xx error', (done) => {
    const context = createMockContext(200);
    const handler: CallHandler = {
      handle: () => throwError(() => ({ status: 400 })),
    };

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(mockLogger.warn).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should pass through non-http contexts', (done) => {
    const context = {
      getType: () => 'rpc',
    } as any;
    const handler: CallHandler = {
      handle: () => of('result'),
    };

    interceptor.intercept(context, handler).subscribe({
      next: (value) => {
        expect(value).toBe('result');
        done();
      },
    });
  });

  it('should include correlation ID in log context', (done) => {
    const context = createMockContext(200);
    const handler = createCallHandler();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        const logContext = mockLogger.info.mock.calls[0][0];
        expect(logContext.correlationId).toBe('test-corr-id');
        done();
      },
    });
  });

  it('should include duration in log context', (done) => {
    const context = createMockContext(200);
    const handler = createCallHandler();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        const logContext = mockLogger.info.mock.calls[0][0];
        expect(typeof logContext.durationMs).toBe('number');
        done();
      },
    });
  });
});
