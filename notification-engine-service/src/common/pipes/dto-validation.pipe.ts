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
        const nes001 = ERROR_CODES['NES-001'];
        return new HttpException(
          {
            code: 'NES-001',
            details: nes001.details,
            message: messages.join('; '),
            status: nes001.status,
          },
          nes001.status,
        );
      },
    });
  }
}
