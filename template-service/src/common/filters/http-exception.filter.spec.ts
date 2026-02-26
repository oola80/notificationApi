import { HttpException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockHost: any;

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
    };
  });

  it('should pass through pre-formatted ErrorResponse', () => {
    const body = {
      code: 'TS-009',
      details: 'TEMPLATE_NOT_FOUND',
      message: 'The requested template was not found',
      status: 404,
    };
    const exception = new HttpException(body, 404);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'TS-009',
        details: 'TEMPLATE_NOT_FOUND',
        message: 'The requested template was not found',
        status: 404,
      }),
    );
  });

  it('should transform class-validator array messages to TS-001', () => {
    const body = { message: ['field must be a string', 'field is required'] };
    const exception = new HttpException(body, 400);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'TS-001',
        details: 'INVALID_REQUEST_BODY',
        message: 'field must be a string; field is required',
      }),
    );
  });

  it('should wrap string responses with TS-007', () => {
    const exception = new HttpException('Something went wrong', 500);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'TS-007',
        details: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong',
      }),
    );
  });

  it('should wrap unknown object responses with TS-007', () => {
    const body = { message: 'Not found' };
    const exception = new HttpException(body, 404);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'TS-007',
        details: 'INTERNAL_SERVER_ERROR',
        message: 'Not found',
      }),
    );
  });

  it('should include stack trace in non-production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const exception = new HttpException('test', 500);

    filter.catch(exception, mockHost);

    const jsonArg = mockResponse.json.mock.calls[0][0];
    expect(jsonArg.stack).toBeDefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('should omit stack trace in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const exception = new HttpException('test', 500);

    filter.catch(exception, mockHost);

    const jsonArg = mockResponse.json.mock.calls[0][0];
    expect(jsonArg.stack).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });
});
