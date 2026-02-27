import { HttpException, ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockResponse: any;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockResponse = { status: mockStatus };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should handle CRS-coded exceptions', () => {
    const exception = new HttpException(
      {
        code: 'CRS-002',
        details: 'ADAPTER_UNAVAILABLE',
        message: 'adapter-sendgrid unavailable',
        status: 503,
      },
      503,
    );

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(503);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CRS-002',
        details: 'ADAPTER_UNAVAILABLE',
        message: 'adapter-sendgrid unavailable',
        status: 503,
      }),
    );
  });

  it('should handle class-validator array messages as CRS-001', () => {
    const exception = new HttpException(
      {
        message: ['field1 is required', 'field2 must be a string'],
        error: 'Bad Request',
        statusCode: 400,
      },
      400,
    );

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CRS-001',
        details: 'INVALID_REQUEST_BODY',
        message: 'field1 is required; field2 must be a string',
      }),
    );
  });

  it('should handle string exceptions as CRS-015', () => {
    const exception = new HttpException('Something broke', 500);

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CRS-015',
        details: 'INTERNAL_SERVER_ERROR',
        message: 'Something broke',
      }),
    );
  });

  it('should handle generic object exceptions as CRS-015', () => {
    const exception = new HttpException(
      { message: 'Not found', statusCode: 404 },
      404,
    );

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CRS-015',
        message: 'Not found',
      }),
    );
  });

  it('should include stack in non-production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const exception = new HttpException('Error', 500);
    filter.catch(exception, mockHost);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.any(String),
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it('should not include stack in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const exception = new HttpException('Error', 500);
    filter.catch(exception, mockHost);

    const responseBody = mockJson.mock.calls[0][0];
    expect(responseBody.stack).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });
});
