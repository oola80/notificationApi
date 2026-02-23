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
        const eis001 = ERROR_CODES['EIS-001'];
        return new HttpException(
          {
            code: 'EIS-001',
            details: eis001.details,
            message: messages.join('; '),
            status: eis001.status,
          },
          eis001.status,
        );
      },
    });
  }
}
