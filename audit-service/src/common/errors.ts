import { HttpException } from '@nestjs/common';
import { ErrorResponse } from './interfaces/error-response.interface.js';

interface ErrorDefinition {
  status: number;
  details: string;
  message: string;
}

export const ERROR_CODES: Record<string, ErrorDefinition> = {
  'AUD-001': {
    status: 400,
    details: 'VALIDATION_ERROR',
    message: 'The request body is invalid',
  },
  'AUD-002': {
    status: 404,
    details: 'AUDIT_EVENT_NOT_FOUND',
    message: 'The requested audit event was not found',
  },
  'AUD-003': {
    status: 404,
    details: 'DLQ_ENTRY_NOT_FOUND',
    message: 'The requested DLQ entry was not found',
  },
  'AUD-004': {
    status: 400,
    details: 'INVALID_DATE_RANGE',
    message: 'The provided date range is invalid or exceeds the maximum allowed',
  },
  'AUD-005': {
    status: 400,
    details: 'INVALID_UUID',
    message: 'The provided ID is not a valid UUID',
  },
  'AUD-006': {
    status: 409,
    details: 'DLQ_INVALID_STATUS_TRANSITION',
    message: 'Invalid DLQ entry status transition',
  },
  'AUD-007': {
    status: 400,
    details: 'SEARCH_RESULTS_LIMIT_EXCEEDED',
    message: 'Search query exceeds the maximum result limit',
  },
  'AUD-008': {
    status: 404,
    details: 'NOTIFICATION_NOT_FOUND',
    message: 'No audit events found for the specified notification',
  },
  'AUD-009': {
    status: 500,
    details: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
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
