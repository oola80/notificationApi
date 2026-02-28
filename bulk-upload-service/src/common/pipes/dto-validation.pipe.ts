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
        const bus001 = ERROR_CODES['BUS-001'];
        return new HttpException(
          {
            code: 'BUS-001',
            details: bus001.details,
            message: messages.join('; '),
            status: bus001.status,
          },
          bus001.status,
        );
      },
    });
  }
}
