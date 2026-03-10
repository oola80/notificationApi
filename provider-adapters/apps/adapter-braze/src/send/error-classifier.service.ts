import { Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';

export interface ClassifiedError {
  retryable: boolean;
  errorMessage: string;
  httpStatus: number;
  errorCode: string;
}

@Injectable()
export class ErrorClassifierService {
  classifyError(error: AxiosError | Error): ClassifiedError {
    // Check for Braze 201-with-errors (partial error)
    if ((error as any).isBrazePartialError) {
      return {
        retryable: false,
        errorMessage: error.message,
        httpStatus: 200,
        errorCode: 'BZ-007',
      };
    }

    if (this.isAxiosError(error)) {
      return this.classifyAxiosError(error);
    }

    if (this.isNetworkError(error)) {
      return {
        retryable: true,
        errorMessage: `Network error: ${error.message}`,
        httpStatus: 503,
        errorCode: 'BZ-002',
      };
    }

    return {
      retryable: false,
      errorMessage: error.message || 'Unknown error',
      httpStatus: 502,
      errorCode: 'PA-003',
    };
  }

  private isAxiosError(error: any): error is AxiosError {
    return error?.isAxiosError === true;
  }

  private isNetworkError(error: Error): boolean {
    const networkCodes = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNABORTED',
    ];
    return networkCodes.includes((error as any).code);
  }

  private classifyAxiosError(error: AxiosError): ClassifiedError {
    if (!error.response) {
      const code = (error as any).code;
      const networkCodes = [
        'ECONNREFUSED',
        'ENOTFOUND',
        'ETIMEDOUT',
        'ECONNRESET',
        'ECONNABORTED',
      ];

      if (networkCodes.includes(code) || error.message?.includes('timeout')) {
        return {
          retryable: true,
          errorMessage: `Connection error: ${error.message}`,
          httpStatus: 503,
          errorCode: 'BZ-002',
        };
      }

      return {
        retryable: false,
        errorMessage: error.message || 'Unknown network error',
        httpStatus: 502,
        errorCode: 'PA-003',
      };
    }

    const status = error.response.status;
    const responseData = error.response.data as any;
    const brazeMessage =
      responseData?.message || error.message || 'Braze API error';

    switch (status) {
      case 400:
        return {
          retryable: false,
          errorMessage: brazeMessage,
          httpStatus: 400,
          errorCode: 'BZ-001',
        };

      case 401:
        return {
          retryable: false,
          errorMessage: 'Invalid Braze API key',
          httpStatus: 401,
          errorCode: 'BZ-003',
        };

      case 429:
        return {
          retryable: true,
          errorMessage: 'Braze rate limit exceeded',
          httpStatus: 429,
          errorCode: 'BZ-004',
        };

      case 500:
      case 503:
        return {
          retryable: true,
          errorMessage: `Braze server error (${status})`,
          httpStatus: status,
          errorCode: 'BZ-002',
        };

      default:
        return {
          retryable: false,
          errorMessage: brazeMessage,
          httpStatus: status,
          errorCode: 'PA-003',
        };
    }
  }
}
