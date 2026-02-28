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
    interceptor = new LoggingInterceptor(mockLogger);
  });

  const createMockContext = (
    type: string,
    method: string,
    url: string,
    statusCode: number,
  ): ExecutionContext =>
    ({
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          url,
          headers: {},
          body: {},
        }),
        getResponse: () => ({ statusCode }),
      }),
    }) as any;

  const createCallHandler = (response?: any): CallHandler => ({
    handle: () => of(response ?? {}),
  });

  const createErrorCallHandler = (error: any): CallHandler => ({
    handle: () => throwError(() => error),
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should set context to HTTP', () => {
    expect(mockLogger.setContext).toHaveBeenCalledWith('HTTP');
  });

  it('should pass through non-http contexts', (done) => {
    const context = createMockContext('rpc', 'GET', '/test', 200);
    const handler = createCallHandler();

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(mockLogger.info).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log info for successful 2xx responses', (done) => {
    const context = createMockContext('http', 'GET', '/uploads', 200);
    const handler = createCallHandler();

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(mockLogger.info).toHaveBeenCalled();
        const [logContext, message] = mockLogger.info.mock.calls[0];
        expect(logContext.method).toBe('GET');
        expect(logContext.url).toBe('/uploads');
        expect(logContext.statusCode).toBe(200);
        expect(logContext.durationMs).toBeDefined();
        expect(message).toContain('GET /uploads 200');
        done();
      },
    });
  });

  it('should log warn for 4xx responses', (done) => {
    const context = createMockContext('http', 'POST', '/uploads', 400);
    const handler = createCallHandler();

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(mockLogger.warn).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log error for 5xx responses', (done) => {
    const context = createMockContext('http', 'GET', '/health', 500);
    const handler = createCallHandler();

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(mockLogger.error).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log warn for 4xx errors in error handler', (done) => {
    const context = createMockContext('http', 'GET', '/uploads/123', 200);
    const error = { status: 404 };
    const handler = createErrorCallHandler(error);

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(mockLogger.warn).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log error for 5xx errors in error handler', (done) => {
    const context = createMockContext('http', 'POST', '/uploads', 200);
    const error = { status: 500 };
    const handler = createErrorCallHandler(error);

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(mockLogger.error).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should default to 500 when error has no status', (done) => {
    const context = createMockContext('http', 'POST', '/uploads', 200);
    const error = new Error('Something broke');
    const handler = createErrorCallHandler(error);

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(mockLogger.error).toHaveBeenCalled();
        done();
      },
    });
  });
});
