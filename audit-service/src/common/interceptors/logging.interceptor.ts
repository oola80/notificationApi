import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = ctx.getResponse<Response>();
          const statusCode = response.statusCode;
          const durationMs = Date.now() - start;
          const message = `${method} ${url} ${statusCode} ${durationMs}ms`;

          const logContext = {
            method,
            url,
            statusCode,
            durationMs,
          };

          if (statusCode >= 500) {
            this.logger.error(logContext, message);
          } else if (statusCode >= 400) {
            this.logger.warn(logContext, message);
          } else {
            this.logger.info(logContext, message);
          }
        },
        error: (error) => {
          const durationMs = Date.now() - start;
          const statusCode = error?.status ?? error?.getStatus?.() ?? 500;
          const message = `${method} ${url} ${statusCode} ${durationMs}ms`;

          const logContext = {
            method,
            url,
            statusCode,
            durationMs,
          };

          if (statusCode >= 500) {
            this.logger.error(logContext, message);
          } else {
            this.logger.warn(logContext, message);
          }
        },
      }),
    );
  }
}
