import { Injectable } from '@nestjs/common';
import Ajv from 'ajv';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export class PayloadValidatorService {
  private readonly ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
  }

  validate(
    payload: Record<string, any>,
    schema: Record<string, any>,
  ): ValidationResult {
    const valid = this.ajv.validate(schema, payload);

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors = (this.ajv.errors ?? []).map(
      (err) => `${err.instancePath || '/'} ${err.message}`,
    );

    return { valid: false, errors };
  }
}
