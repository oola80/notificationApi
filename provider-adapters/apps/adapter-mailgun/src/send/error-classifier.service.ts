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
    if (this.isAxiosError(error)) {
      return this.classifyAxiosError(error);
    }

    if (this.isNetworkError(error)) {
      return {
        retryable: true,
        errorMessage: `Network error: ${error.message}`,
        httpStatus: 503,
        errorCode: 'MG-002',
      };
    }

    return {
      retryable: false,
      errorMessage: error.message || 'Unknown error',
      httpStatus: 502,
      errorCode: 'MG-003',
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
          errorCode: 'MG-002',
        };
      }

      return {
        retryable: false,
        errorMessage: error.message || 'Unknown network error',
        httpStatus: 502,
        errorCode: 'MG-003',
      };
    }

    const status = error.response.status;
    const responseData = error.response.data as any;
    const mailgunMessage =
      responseData?.message || error.message || 'Mailgun API error';

    switch (status) {
      case 400:
        return {
          retryable: false,
          errorMessage: mailgunMessage,
          httpStatus: 400,
          errorCode: 'MG-009',
        };

      case 401:
        return {
          retryable: false,
          errorMessage: 'Invalid Mailgun API key',
          httpStatus: 401,
          errorCode: 'MG-005',
        };

      case 402:
        return {
          retryable: false,
          errorMessage: 'Mailgun account suspended or billing issue',
          httpStatus: 402,
          errorCode: 'MG-003',
        };

      case 404:
        return {
          retryable: false,
          errorMessage: 'Mailgun sending domain not found',
          httpStatus: 404,
          errorCode: 'MG-006',
        };

      case 413:
        return {
          retryable: false,
          errorMessage: 'Attachment exceeds Mailgun size limit',
          httpStatus: 413,
          errorCode: 'MG-008',
        };

      case 429:
        return {
          retryable: true,
          errorMessage: 'Mailgun rate limit exceeded',
          httpStatus: 429,
          errorCode: 'MG-007',
        };

      case 500:
      case 502:
      case 503:
        return {
          retryable: true,
          errorMessage: `Mailgun server error (${status})`,
          httpStatus: status,
          errorCode: 'MG-002',
        };

      default:
        return {
          retryable: false,
          errorMessage: mailgunMessage,
          httpStatus: status,
          errorCode: 'MG-003',
        };
    }
  }
}
