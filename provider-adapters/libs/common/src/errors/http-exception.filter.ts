import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorResponse } from './error-response.interface.js';
import { BASE_ERROR_CODES } from './base-errors.js';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let errorResponse: ErrorResponse;

    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'code' in exceptionResponse
    ) {
      errorResponse = exceptionResponse as ErrorResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse &&
      Array.isArray((exceptionResponse as any).message)
    ) {
      const messages = (exceptionResponse as any).message as string[];
      const pa001 = BASE_ERROR_CODES['PA-001'];
      errorResponse = {
        code: 'PA-001',
        details: pa001.details,
        message: messages.join('; '),
        status,
      };
    } else {
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as any)?.message ??
            'An unexpected error occurred');
      const pa007 = BASE_ERROR_CODES['PA-007'];
      errorResponse = {
        code: 'PA-007',
        details: pa007.details,
        message,
        status,
      };
    }

    if (process.env.NODE_ENV !== 'production' && exception.stack) {
      errorResponse.stack = exception.stack;
    }

    response.status(status).json(errorResponse);
  }
}
