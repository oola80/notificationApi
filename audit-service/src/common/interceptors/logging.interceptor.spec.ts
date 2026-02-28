import { LoggingInterceptor } from './logging.interceptor';
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

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should set context to HTTP', () => {
    expect(mockLogger.setContext).toHaveBeenCalledWith('HTTP');
  });

  it('should log info for successful 2xx responses', (done) => {
    const mockContext = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/health' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    };
    const mockNext = { handle: () => of({ status: 'ok' }) };

    interceptor.intercept(mockContext as any, mockNext as any).subscribe({
      complete: () => {
        expect(mockLogger.info).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log warn for 4xx error responses', (done) => {
    const mockContext = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/audit/trace/bad' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    };
    const mockNext = {
      handle: () => throwError(() => ({ status: 404, getStatus: () => 404 })),
    };

    interceptor.intercept(mockContext as any, mockNext as any).subscribe({
      error: () => {
        expect(mockLogger.warn).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should pass through non-http contexts', (done) => {
    const mockContext = {
      getType: () => 'rpc',
      switchToHttp: () => ({}),
    };
    const mockNext = { handle: () => of('result') };

    interceptor.intercept(mockContext as any, mockNext as any).subscribe({
      next: (value) => {
        expect(value).toBe('result');
      },
      complete: done,
    });
  });
});
