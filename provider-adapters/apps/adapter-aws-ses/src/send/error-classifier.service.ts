import { Injectable } from '@nestjs/common';

export interface ClassifiedError {
  retryable: boolean;
  errorMessage: string;
  httpStatus: number;
  errorCode: string;
}

@Injectable()
export class ErrorClassifierService {
  classifyError(error: Error): ClassifiedError {
    const message = error.message || 'Unknown error';
    const code = (error as any).code;
    const name = (error as any).name || '';
    const httpStatusCode = (error as any).$metadata?.httpStatusCode;

    // AWS SDK: ThrottlingException / TooManyRequestsException (retryable)
    if (
      name === 'ThrottlingException' ||
      name === 'TooManyRequestsException'
    ) {
      return {
        retryable: true,
        errorMessage: `SES rate limit exceeded: ${message}`,
        httpStatus: 429,
        errorCode: 'SES-006',
      };
    }

    // AWS SDK: AccountSendingPausedException (non-retryable)
    if (name === 'AccountSendingPausedException') {
      return {
        retryable: false,
        errorMessage: `SES account sending paused: ${message}`,
        httpStatus: 403,
        errorCode: 'SES-008',
      };
    }

    // AWS SDK: MessageRejected (non-retryable)
    if (name === 'MessageRejected') {
      return {
        retryable: false,
        errorMessage: `SES message rejected: ${message}`,
        httpStatus: 400,
        errorCode: 'SES-007',
      };
    }

    // AWS SDK: MailFromDomainNotVerifiedException (non-retryable)
    if (name === 'MailFromDomainNotVerifiedException') {
      return {
        retryable: false,
        errorMessage: `SES domain not verified: ${message}`,
        httpStatus: 400,
        errorCode: 'SES-005',
      };
    }

    // AWS SDK: NotFoundException / BadRequestException (non-retryable)
    if (name === 'NotFoundException' || name === 'BadRequestException') {
      return {
        retryable: false,
        errorMessage: `SES message rejected: ${message}`,
        httpStatus: 400,
        errorCode: 'SES-007',
      };
    }

    // AWS SDK: generic SESv2ServiceException with 5xx status (retryable)
    if (httpStatusCode && httpStatusCode >= 500) {
      return {
        retryable: true,
        errorMessage: `SES service error: ${message}`,
        httpStatus: 503,
        errorCode: 'SES-002',
      };
    }

    // SMTP authentication errors
    if (
      code === 'EAUTH' ||
      message.includes('Invalid login') ||
      message.includes('Authentication')
    ) {
      return {
        retryable: false,
        errorMessage: `SES authentication failed: ${message}`,
        httpStatus: 401,
        errorCode: 'SES-004',
      };
    }

    // Throttling / rate limit errors (message-based)
    if (
      message.includes('Throttling') ||
      message.includes('Maximum sending rate exceeded') ||
      message.includes('Daily message quota exceeded')
    ) {
      return {
        retryable: true,
        errorMessage: `SES rate limit exceeded: ${message}`,
        httpStatus: 429,
        errorCode: 'SES-006',
      };
    }

    // Message rejected by SES (message-based)
    if (
      message.includes('MessageRejected') ||
      message.includes('Message rejected') ||
      code === 'EMESSAGE'
    ) {
      return {
        retryable: false,
        errorMessage: `SES message rejected: ${message}`,
        httpStatus: 400,
        errorCode: 'SES-007',
      };
    }

    // Domain not verified (message-based)
    if (
      message.includes('not verified') ||
      message.includes('MailFromDomainNotVerified')
    ) {
      return {
        retryable: false,
        errorMessage: `SES domain not verified: ${message}`,
        httpStatus: 400,
        errorCode: 'SES-005',
      };
    }

    // Account sending paused (message-based)
    if (
      message.includes('AccountSendingPaused') ||
      message.includes('sending paused')
    ) {
      return {
        retryable: false,
        errorMessage: `SES account sending paused: ${message}`,
        httpStatus: 403,
        errorCode: 'SES-008',
      };
    }

    // Network errors (retryable)
    if (this.isNetworkError(error)) {
      return {
        retryable: true,
        errorMessage: `Network error: ${message}`,
        httpStatus: 503,
        errorCode: 'SES-002',
      };
    }

    // Timeout errors (retryable)
    if (
      code === 'ETIMEDOUT' ||
      code === 'ESOCKET' ||
      message.includes('timeout')
    ) {
      return {
        retryable: true,
        errorMessage: `Connection timeout: ${message}`,
        httpStatus: 503,
        errorCode: 'SES-002',
      };
    }

    // Invalid recipient
    if (
      message.includes('Invalid address') ||
      message.includes('rejected')
    ) {
      return {
        retryable: false,
        errorMessage: `Invalid recipient: ${message}`,
        httpStatus: 400,
        errorCode: 'SES-010',
      };
    }

    // Default: non-retryable send failure
    return {
      retryable: false,
      errorMessage: message,
      httpStatus: 502,
      errorCode: 'SES-003',
    };
  }

  private isNetworkError(error: Error): boolean {
    const networkCodes = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ECONNRESET',
      'ECONNABORTED',
    ];
    return networkCodes.includes((error as any).code);
  }
}
