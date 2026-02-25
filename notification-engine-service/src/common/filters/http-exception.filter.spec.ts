import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
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
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as unknown as ArgumentsHost;
  });

  it('should pass through ErrorResponse with code property', () => {
    const body = {
      code: 'NES-002',
      details: 'RULE_NOT_FOUND',
      message: 'Not found',
      status: 404,
    };
    const exception = new HttpException(body, HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'NES-002',
        details: 'RULE_NOT_FOUND',
        message: 'Not found',
        status: 404,
      }),
    );
  });

  it('should transform class-validator error array to NES-001', () => {
    const body = {
      statusCode: 400,
      message: ['name should not be empty', 'eventType should not be empty'],
      error: 'Bad Request',
    };
    const exception = new HttpException(body, HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'NES-001',
        details: 'INVALID_REQUEST_BODY',
        message: 'name should not be empty; eventType should not be empty',
      }),
    );
  });

  it('should wrap string response with NES-007', () => {
    const exception = new HttpException(
      'Something went wrong',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'NES-007',
        details: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong',
      }),
    );
  });

  it('should include stack trace in non-production environment', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const exception = new HttpException('Error', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    const jsonArg = mockResponse.json.mock.calls[0][0];
    expect(jsonArg.stack).toBeDefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('should not include stack trace in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const exception = new HttpException('Error', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost);

    const jsonArg = mockResponse.json.mock.calls[0][0];
    expect(jsonArg.stack).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });
});
