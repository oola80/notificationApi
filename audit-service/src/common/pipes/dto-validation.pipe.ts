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
        const aud001 = ERROR_CODES['AUD-001'];
        return new HttpException(
          {
            code: 'AUD-001',
            details: aud001.details,
            message: messages.join('; '),
            status: aud001.status,
          },
          aud001.status,
        );
      },
    });
  }
}
