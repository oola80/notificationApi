import { ValidationPipe, HttpException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { BASE_ERROR_CODES } from '../errors/base-errors.js';

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
        const pa001 = BASE_ERROR_CODES['PA-001'];
        return new HttpException(
          {
            code: 'PA-001',
            details: pa001.details,
            message: messages.join('; '),
            status: pa001.status,
          },
          pa001.status,
        );
      },
    });
  }
}
