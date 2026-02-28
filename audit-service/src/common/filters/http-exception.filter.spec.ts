import { HttpException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { createErrorResponse } from '../errors';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockArgumentsHost: any;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockArgumentsHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
    };
  });

  it('should handle standardized error responses (with code)', () => {
    const exception = createErrorResponse('AUD-001');
    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUD-001',
        details: 'VALIDATION_ERROR',
        status: 400,
      }),
    );
  });

  it('should handle validation errors (message array)', () => {
    const exception = new HttpException(
      { message: ['field1 is required', 'field2 must be a string'] },
      400,
    );
    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUD-001',
        message: 'field1 is required; field2 must be a string',
      }),
    );
  });

  it('should handle string error responses', () => {
    const exception = new HttpException('Something went wrong', 500);
    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUD-009',
        message: 'Something went wrong',
      }),
    );
  });

  it('should handle generic object error responses', () => {
    const exception = new HttpException(
      { message: 'Generic error' },
      500,
    );
    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUD-009',
        message: 'Generic error',
      }),
    );
  });
});
