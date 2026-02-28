import { HttpException, ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
    } as any;
  });

  it('should handle structured error response (with code)', () => {
    const body = {
      code: 'BUS-002',
      details: 'UPLOAD_NOT_FOUND',
      message: 'Not found',
      status: 404,
    };
    const exception = new HttpException(body, 404);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'BUS-002',
        details: 'UPLOAD_NOT_FOUND',
        message: 'Not found',
        status: 404,
      }),
    );
  });

  it('should handle validation errors (array of messages)', () => {
    const body = { message: ['field1 is required', 'field2 is invalid'] };
    const exception = new HttpException(body, 400);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'BUS-001',
        details: 'VALIDATION_ERROR',
        message: 'field1 is required; field2 is invalid',
      }),
    );
  });

  it('should handle string error response', () => {
    const exception = new HttpException('Something went wrong', 500);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'BUS-009',
        message: 'Something went wrong',
      }),
    );
  });

  it('should handle object with message string', () => {
    const body = { message: 'Bad request' };
    const exception = new HttpException(body, 400);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'BUS-009',
        message: 'Bad request',
      }),
    );
  });

  it('should include stack trace in non-production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const exception = new HttpException('Test error', 500);
    filter.catch(exception, mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.any(String),
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should not include stack trace in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const exception = new HttpException('Test error', 500);
    filter.catch(exception, mockHost);

    const jsonArg = mockResponse.json.mock.calls[0][0];
    expect(jsonArg.stack).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });
});
