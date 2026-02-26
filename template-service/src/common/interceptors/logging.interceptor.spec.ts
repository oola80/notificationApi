import { LoggingInterceptor } from './logging.interceptor.js';
import { of, throwError } from 'rxjs';

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

  function createHttpContext(
    statusCode: number,
    headers: Record<string, string> = {},
  ) {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/test',
          headers,
          body: {},
        }),
        getResponse: () => ({ statusCode }),
      }),
    } as any;
  }

  it('should log info for 2xx responses', (done) => {
    const context = createHttpContext(200);
    const next = { handle: () => of('result') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLogger.info).toHaveBeenCalled();
        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log warn for 4xx responses', (done) => {
    const context = createHttpContext(404);
    const next = { handle: () => of('result') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLogger.warn).toHaveBeenCalled();
        expect(mockLogger.info).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log error for 5xx responses', (done) => {
    const context = createHttpContext(500);
    const next = { handle: () => of('result') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLogger.error).toHaveBeenCalled();
        expect(mockLogger.info).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should include correlationId from x-request-id header', (done) => {
    const context = createHttpContext(200, {
      'x-request-id': 'test-correlation-123',
    });
    const next = { handle: () => of('result') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId: 'test-correlation-123',
          }),
          expect.any(String),
        );
        done();
      },
    });
  });

  it('should pass through non-HTTP contexts without logging', (done) => {
    const context = {
      getType: () => 'rpc',
      switchToHttp: () => ({}),
    } as any;
    const next = { handle: () => of('result') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLogger.info).not.toHaveBeenCalled();
        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log error for thrown 5xx errors', (done) => {
    const context = createHttpContext(200);
    const error = { status: 500, message: 'Internal error' };
    const next = { handle: () => throwError(() => error) };

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expect(mockLogger.error).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log warn for thrown 4xx errors', (done) => {
    const context = createHttpContext(200);
    const error = { status: 400, message: 'Bad request' };
    const next = { handle: () => throwError(() => error) };

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expect(mockLogger.warn).toHaveBeenCalled();
        done();
      },
    });
  });
});
