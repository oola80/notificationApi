import { HttpException } from '@nestjs/common';
import { ErrorResponse } from './interfaces/error-response.interface.js';

interface ErrorDefinition {
  status: number;
  details: string;
  message: string;
}

export const ERROR_CODES: Record<string, ErrorDefinition> = {
  'CRS-001': {
    status: 400,
    details: 'INVALID_REQUEST_BODY',
    message: 'The request body is invalid',
  },
  'CRS-002': {
    status: 503,
    details: 'ADAPTER_UNAVAILABLE',
    message: 'The adapter service is unavailable',
  },
  'CRS-003': {
    status: 503,
    details: 'CIRCUIT_BREAKER_OPEN',
    message: 'Circuit breaker is open for the adapter',
  },
  'CRS-004': {
    status: 429,
    details: 'RATE_LIMIT_EXCEEDED',
    message: 'Rate limit exceeded for the adapter',
  },
  'CRS-005': {
    status: 502,
    details: 'RETRY_EXHAUSTED',
    message: 'All retry attempts have been exhausted',
  },
  'CRS-006': {
    status: 502,
    details: 'MEDIA_DOWNLOAD_FAILED',
    message: 'Failed to download media attachment',
  },
  'CRS-007': {
    status: 400,
    details: 'INVALID_DISPATCH_MESSAGE',
    message: 'The dispatch message is invalid or malformed',
  },
  'CRS-008': {
    status: 404,
    details: 'CHANNEL_NOT_FOUND',
    message: 'The requested channel was not found',
  },
  'CRS-009': {
    status: 404,
    details: 'PROVIDER_NOT_FOUND',
    message: 'No provider found for the channel',
  },
  'CRS-010': {
    status: 422,
    details: 'PROVIDER_NOT_ACTIVE',
    message: 'The selected provider is not active',
  },
  'CRS-011': {
    status: 502,
    details: 'FALLBACK_FAILED',
    message: 'Fallback delivery also failed',
  },
  'CRS-012': {
    status: 500,
    details: 'DLQ_PUBLISH_FAILED',
    message: 'Failed to publish message to dead letter queue',
  },
  'CRS-013': {
    status: 503,
    details: 'HEALTH_CHECK_FAILED',
    message: 'Adapter health check failed',
  },
  'CRS-014': {
    status: 500,
    details: 'DATABASE_ERROR',
    message: 'A database operation failed',
  },
  'CRS-015': {
    status: 500,
    details: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  },
  'CRS-016': {
    status: 400,
    details: 'INVALID_UUID',
    message: 'The provided ID is not a valid UUID',
  },
  'CRS-017': {
    status: 400,
    details: 'INVALID_QUERY_PARAMS',
    message: 'One or more query parameters are invalid',
  },
  'CRS-018': {
    status: 500,
    details: 'RABBITMQ_PUBLISH_FAILED',
    message: 'Failed to publish message to RabbitMQ',
  },
  'CRS-019': {
    status: 500,
    details: 'CONSUMER_PROCESSING_FAILED',
    message: 'Consumer failed to process message',
  },
  'CRS-020': {
    status: 409,
    details: 'DUPLICATE_PROVIDER',
    message: 'A provider with this adapter URL already exists',
  },
  'CRS-021': {
    status: 422,
    details: 'MEDIA_TOO_LARGE',
    message: 'Media attachment exceeds maximum file size',
  },
  'CRS-022': {
    status: 422,
    details: 'MEDIA_TOTAL_TOO_LARGE',
    message: 'Total media size exceeds maximum allowed',
  },
  'CRS-023': {
    status: 502,
    details: 'ADAPTER_SEND_FAILED',
    message: 'Adapter service returned an error for the send request',
  },
  'CRS-024': {
    status: 409,
    details: 'CHANNEL_CONFIG_CONFLICT',
    message: 'A configuration with this key already exists for the channel',
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
