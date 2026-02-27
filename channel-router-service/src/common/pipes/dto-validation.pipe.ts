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
        const crs001 = ERROR_CODES['CRS-001'];
        return new HttpException(
          {
            code: 'CRS-001',
            details: crs001.details,
            message: messages.join('; '),
            status: crs001.status,
          },
          crs001.status,
        );
      },
    });
  }
}
