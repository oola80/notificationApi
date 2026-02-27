import { HttpException, ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockGetResponse: jest.Mock;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockGetResponse = jest.fn().mockReturnValue({ status: mockStatus });
    mockHost = {
      switchToHttp: () => ({
        getResponse: mockGetResponse,
        getRequest: jest.fn(),
      }),
    } as any;
  });

  it('should handle exceptions with error code in response', () => {
    const exception = new HttpException(
      {
        code: 'PA-001',
        details: 'INVALID_REQUEST_BODY',
        message: 'Invalid',
        status: 400,
      },
      400,
    );

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PA-001',
        details: 'INVALID_REQUEST_BODY',
        message: 'Invalid',
        status: 400,
      }),
    );
  });

  it('should handle validation error arrays as PA-001', () => {
    const exception = new HttpException(
      { message: ['field1 is required', 'field2 must be a string'] },
      400,
    );

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PA-001',
        message: 'field1 is required; field2 must be a string',
      }),
    );
  });

  it('should handle string exception responses as PA-007', () => {
    const exception = new HttpException('Something went wrong', 500);

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PA-007',
        message: 'Something went wrong',
      }),
    );
  });

  it('should handle object responses without code as PA-007', () => {
    const exception = new HttpException(
      { message: 'Not found' },
      404,
    );

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PA-007',
        message: 'Not found',
      }),
    );
  });

  it('should include stack in non-production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const exception = new HttpException('Error', 500);
    filter.catch(exception, mockHost);

    const response = mockJson.mock.calls[0][0];
    expect(response.stack).toBeDefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('should not include stack in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const exception = new HttpException('Error', 500);
    filter.catch(exception, mockHost);

    const response = mockJson.mock.calls[0][0];
    expect(response.stack).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });
});
