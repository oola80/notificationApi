import { ValidationPipe, HttpException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ERROR_CODES } from '../errors.js';

export class DtoValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors: ValidationError[]) => {
        const messages = errors.flatMap((error) =>
          Object.values(error.constraints ?? {}),
        );
        const ts001 = ERROR_CODES['TS-001'];
        return new HttpException(
          {
            code: 'TS-001',
            details: ts001.details,
            message: messages.join('; '),
            status: ts001.status,
          },
          ts001.status,
        );
      },
    });
  }
}
