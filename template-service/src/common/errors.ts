import { HttpException } from '@nestjs/common';
import { ErrorResponse } from './interfaces/error-response.interface.js';

interface ErrorDefinition {
  status: number;
  details: string;
  message: string;
}

export const ERROR_CODES: Record<string, ErrorDefinition> = {
  'TS-001': {
    status: 400,
    details: 'INVALID_REQUEST_BODY',
    message: 'The request body is invalid',
  },
  'TS-002': {
    status: 409,
    details: 'DUPLICATE_SLUG',
    message: 'A template with this slug already exists',
  },
  'TS-003': {
    status: 422,
    details: 'VALIDATION_FAILED',
    message: 'Validation failed',
  },
  'TS-004': {
    status: 422,
    details: 'TEMPLATE_INACTIVE',
    message: 'The template is inactive',
  },
  'TS-005': {
    status: 500,
    details: 'RENDER_ERROR',
    message: 'Template rendering failed',
  },
  'TS-006': {
    status: 422,
    details: 'VARIABLE_MISSING',
    message: 'Required template variable is missing',
  },
  'TS-007': {
    status: 500,
    details: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  },
  'TS-008': {
    status: 500,
    details: 'DATABASE_ERROR',
    message: 'A database operation failed',
  },
  'TS-009': {
    status: 404,
    details: 'TEMPLATE_NOT_FOUND',
    message: 'The requested template was not found',
  },
  'TS-010': {
    status: 404,
    details: 'VERSION_NOT_FOUND',
    message: 'The requested template version was not found',
  },
  'TS-011': {
    status: 400,
    details: 'INVALID_ROLLBACK_VERSION',
    message: 'Cannot rollback to the specified version',
  },
  'TS-012': {
    status: 504,
    details: 'RENDER_TIMEOUT',
    message: 'Template rendering timed out',
  },
};

export function createErrorResponse(
  code: string,
  messageOverride?: string,
): HttpException {
  const definition = ERROR_CODES[code];
  if (!definition) {
    throw new Error(`Unknown error code: ${code}`);
  }

  const body: ErrorResponse = {
    code,
    details: definition.details,
    message: messageOverride ?? definition.message,
    status: definition.status,
  };

  return new HttpException(body, definition.status);
}
