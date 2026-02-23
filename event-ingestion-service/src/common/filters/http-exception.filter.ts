import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorResponse } from '../interfaces/error-response.interface.js';
import { ERROR_CODES } from '../errors.js';

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
      const eis001 = ERROR_CODES['EIS-001'];
      errorResponse = {
        code: 'EIS-001',
        details: eis001.details,
        message: messages.join('; '),
        status,
      };
    } else {
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as any)?.message ??
            'An unexpected error occurred');
      const eis007 = ERROR_CODES['EIS-007'];
      errorResponse = {
        code: 'EIS-007',
        details: eis007.details,
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
