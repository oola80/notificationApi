import { HttpException } from '@nestjs/common';
import { ErrorResponse } from './interfaces/error-response.interface.js';

interface ErrorDefinition {
  status: number;
  details: string;
  message: string;
}

export const ERROR_CODES: Record<string, ErrorDefinition> = {
  'NES-001': {
    status: 400,
    details: 'INVALID_REQUEST_BODY',
    message: 'The request body is invalid',
  },
  'NES-002': {
    status: 404,
    details: 'RULE_NOT_FOUND',
    message: 'The requested notification rule was not found',
  },
  'NES-003': {
    status: 404,
    details: 'NOTIFICATION_NOT_FOUND',
    message: 'The requested notification was not found',
  },
  'NES-004': {
    status: 404,
    details: 'RECIPIENT_GROUP_NOT_FOUND',
    message: 'The requested recipient group was not found',
  },
  'NES-005': {
    status: 404,
    details: 'OVERRIDE_NOT_FOUND',
    message: 'The requested critical channel override was not found',
  },
  'NES-006': {
    status: 409,
    details: 'DUPLICATE_RULE',
    message: 'A rule with the same event type and conditions already exists',
  },
  'NES-007': {
    status: 500,
    details: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  },
  'NES-008': {
    status: 500,
    details: 'DATABASE_ERROR',
    message: 'A database operation failed',
  },
  'NES-009': {
    status: 422,
    details: 'VALIDATION_FAILED',
    message: 'Validation failed',
  },
  'NES-010': {
    status: 404,
    details: 'PREFERENCE_NOT_FOUND',
    message: 'The requested customer channel preference was not found',
  },
  'NES-011': {
    status: 409,
    details: 'DUPLICATE_OVERRIDE',
    message:
      'A critical channel override for this event type and channel already exists',
  },
  'NES-012': {
    status: 400,
    details: 'BULK_LIMIT_EXCEEDED',
    message: 'Bulk upsert exceeds the maximum of 1000 records',
  },
  'NES-013': {
    status: 401,
    details: 'UNAUTHORIZED_WEBHOOK',
    message: 'Invalid or missing API key',
  },
  'NES-014': {
    status: 409,
    details: 'DUPLICATE_RECIPIENT_GROUP',
    message: 'A recipient group with this name already exists',
  },
  'NES-015': {
    status: 422,
    details: 'INVALID_STATUS_TRANSITION',
    message: 'The requested status transition is not allowed',
  },
  'NES-016': {
    status: 500,
    details: 'RABBITMQ_PUBLISH_FAILED',
    message: 'Failed to publish message to RabbitMQ',
  },
  'NES-017': {
    status: 500,
    details: 'CONSUMER_PROCESSING_FAILED',
    message: 'Consumer event processing failed',
  },
  'NES-018': {
    status: 502,
    details: 'TEMPLATE_RENDER_FAILED',
    message: 'Template service render request failed',
  },
  'NES-019': {
    status: 404,
    details: 'TEMPLATE_NOT_FOUND',
    message: 'Template not found in template service',
  },
  'NES-020': {
    status: 503,
    details: 'TEMPLATE_SERVICE_CIRCUIT_OPEN',
    message: 'Template service circuit breaker is open',
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
