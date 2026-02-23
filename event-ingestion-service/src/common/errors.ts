import { HttpException } from '@nestjs/common';
import { ErrorResponse } from './interfaces/error-response.interface.js';

interface ErrorDefinition {
  status: number;
  details: string;
  message: string;
}

export const ERROR_CODES: Record<string, ErrorDefinition> = {
  'EIS-001': {
    status: 400,
    details: 'INVALID_REQUEST_BODY',
    message: 'The request body is invalid',
  },
  'EIS-002': {
    status: 404,
    details: 'EVENT_MAPPING_NOT_FOUND',
    message: 'The requested event mapping was not found',
  },
  'EIS-003': {
    status: 404,
    details: 'EVENT_SOURCE_NOT_FOUND',
    message: 'The requested event source was not found',
  },
  'EIS-004': {
    status: 200,
    details: 'DUPLICATE_EVENT',
    message: 'This event has already been processed',
  },
  'EIS-005': {
    status: 422,
    details: 'VALIDATION_FAILED',
    message: 'Event validation failed against the mapping schema',
  },
  'EIS-006': {
    status: 500,
    details: 'DATABASE_ERROR',
    message: 'A database operation failed',
  },
  'EIS-007': {
    status: 500,
    details: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  },
  'EIS-008': {
    status: 422,
    details: 'EVENT_SOURCE_INACTIVE',
    message: 'The event source is inactive',
  },
  'EIS-009': {
    status: 409,
    details: 'MAPPING_CONFLICT',
    message:
      'An active mapping already exists for this source and event type combination',
  },
  'EIS-010': {
    status: 400,
    details: 'INVALID_UUID',
    message: 'The provided ID is not a valid UUID',
  },
  'EIS-011': {
    status: 400,
    details: 'INVALID_QUERY_PARAMS',
    message: 'One or more query parameters are invalid',
  },
  'EIS-012': {
    status: 400,
    details: 'INVALID_PRIORITY',
    message: 'Priority must be either "normal" or "critical"',
  },
  'EIS-013': {
    status: 401,
    details: 'UNAUTHORIZED',
    message: 'Source authentication failed',
  },
  'EIS-014': {
    status: 422,
    details: 'MAPPING_NOT_FOUND',
    message: 'No active mapping found for this source and event type',
  },
  'EIS-015': {
    status: 404,
    details: 'EVENT_NOT_FOUND',
    message: 'Event not found',
  },
  'EIS-016': {
    status: 422,
    details: 'NORMALIZATION_FAILED',
    message: 'Event normalization failed',
  },
  'EIS-017': {
    status: 429,
    details: 'RATE_LIMIT_EXCEEDED',
    message: 'Source rate limit exceeded',
  },
  'EIS-018': {
    status: 500,
    details: 'RABBITMQ_PUBLISH_FAILED',
    message: 'Failed to publish message to RabbitMQ',
  },
  'EIS-019': {
    status: 500,
    details: 'CONSUMER_PROCESSING_FAILED',
    message: 'Consumer failed to process message',
  },
  'EIS-020': {
    status: 400,
    details: 'INVALID_ROUTING_KEY',
    message: 'The message routing key is invalid',
  },
  'EIS-021': {
    status: 503,
    details: 'CACHE_NOT_READY',
    message: 'Mapping cache is warming up',
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
