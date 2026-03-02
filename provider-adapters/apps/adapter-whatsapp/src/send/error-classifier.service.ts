import { Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import type { WhatsAppApiErrorResponse } from '../whatsapp-client/interfaces/whatsapp.interfaces.js';

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
        errorCode: 'WA-002',
      };
    }

    return {
      retryable: false,
      errorMessage: error.message || 'Unknown error',
      httpStatus: 502,
      errorCode: 'WA-003',
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
          errorCode: 'WA-002',
        };
      }

      return {
        retryable: false,
        errorMessage: error.message || 'Unknown network error',
        httpStatus: 502,
        errorCode: 'WA-003',
      };
    }

    // Level 1: Check Meta-specific error codes in response body
    const metaClassified = this.classifyMetaErrorCode(error);
    if (metaClassified) {
      return metaClassified;
    }

    // Level 2: Fall back to HTTP status classification
    return this.classifyByHttpStatus(error);
  }

  private classifyMetaErrorCode(
    error: AxiosError,
  ): ClassifiedError | null {
    const responseData = error.response?.data as
      | WhatsAppApiErrorResponse
      | undefined;
    const metaError = responseData?.error;

    if (!metaError?.code) {
      return null;
    }

    const code = metaError.code;
    const subcode = metaError.error_subcode;
    const message = metaError.message || 'WhatsApp API error';

    // Rate limit (130429)
    if (code === 130429) {
      return {
        retryable: true,
        errorMessage: `Rate limit exceeded: ${message}`,
        httpStatus: 429,
        errorCode: 'WA-007',
      };
    }

    // Not on WhatsApp (131026)
    if (subcode === 131026) {
      return {
        retryable: false,
        errorMessage: `Recipient not on WhatsApp: ${message}`,
        httpStatus: 400,
        errorCode: 'WA-005',
      };
    }

    // 24h conversation window expired (131047)
    if (subcode === 131047) {
      return {
        retryable: false,
        errorMessage: `Conversation window expired: ${message}`,
        httpStatus: 400,
        errorCode: 'WA-010',
      };
    }

    // Unsupported message type (131051)
    if (subcode === 131051) {
      return {
        retryable: false,
        errorMessage: `Unsupported message type: ${message}`,
        httpStatus: 400,
        errorCode: 'WA-001',
      };
    }

    // Template not found (132000)
    if (code === 132000) {
      return {
        retryable: false,
        errorMessage: `Template not found: ${message}`,
        httpStatus: 404,
        errorCode: 'WA-006',
      };
    }

    // Template parameter mismatch (132012)
    if (subcode === 132012) {
      return {
        retryable: false,
        errorMessage: `Template parameter mismatch: ${message}`,
        httpStatus: 400,
        errorCode: 'WA-008',
      };
    }

    // Generic error (135000) - retryable
    if (code === 135000) {
      return {
        retryable: true,
        errorMessage: `WhatsApp generic error: ${message}`,
        httpStatus: 500,
        errorCode: 'WA-002',
      };
    }

    // Policy violation (368)
    if (code === 368) {
      return {
        retryable: false,
        errorMessage: `Policy violation: ${message}`,
        httpStatus: 403,
        errorCode: 'WA-009',
      };
    }

    return null;
  }

  private classifyByHttpStatus(error: AxiosError): ClassifiedError {
    const status = error.response!.status;
    const responseData = error.response!.data as any;
    const message =
      responseData?.error?.message ||
      responseData?.message ||
      error.message ||
      'WhatsApp API error';

    switch (status) {
      case 400:
        return {
          retryable: false,
          errorMessage: message,
          httpStatus: 400,
          errorCode: 'WA-005',
        };

      case 401:
        return {
          retryable: false,
          errorMessage: 'Invalid or expired Meta access token',
          httpStatus: 401,
          errorCode: 'WA-004',
        };

      case 403:
        return {
          retryable: false,
          errorMessage: `Forbidden: ${message}`,
          httpStatus: 403,
          errorCode: 'WA-009',
        };

      case 429:
        return {
          retryable: true,
          errorMessage: 'WhatsApp rate limit exceeded',
          httpStatus: 429,
          errorCode: 'WA-007',
        };

      case 500:
      case 502:
      case 503:
        return {
          retryable: true,
          errorMessage: `WhatsApp server error (${status})`,
          httpStatus: status,
          errorCode: 'WA-002',
        };

      default:
        return {
          retryable: false,
          errorMessage: message,
          httpStatus: status,
          errorCode: 'WA-003',
        };
    }
  }
}
