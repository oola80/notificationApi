import { HttpException } from '@nestjs/common';
import { ErrorResponse } from './error-response.interface.js';

export interface ErrorDefinition {
  status: number;
  details: string;
  message: string;
}

export const BASE_ERROR_CODES: Record<string, ErrorDefinition> = {
  'PA-001': {
    status: 400,
    details: 'INVALID_REQUEST_BODY',
    message: 'The request body is invalid',
  },
  'PA-002': {
    status: 503,
    details: 'PROVIDER_UNAVAILABLE',
    message: 'The provider API is unavailable',
  },
  'PA-003': {
    status: 502,
    details: 'SEND_FAILED',
    message: 'Failed to send notification via provider',
  },
  'PA-004': {
    status: 401,
    details: 'WEBHOOK_VERIFICATION_FAILED',
    message: 'Webhook signature verification failed',
  },
  'PA-005': {
    status: 500,
    details: 'RABBITMQ_PUBLISH_FAILED',
    message: 'Failed to publish event to RabbitMQ',
  },
  'PA-006': {
    status: 500,
    details: 'MEDIA_PROCESSING_FAILED',
    message: 'Failed to process media attachment',
  },
  'PA-007': {
    status: 500,
    details: 'CONFIGURATION_ERROR',
    message: 'Adapter configuration is invalid or missing',
  },
};

export function createErrorResponse(
  code: string,
  registry: Record<string, ErrorDefinition>,
  messageOverride?: string,
): HttpException {
  const definition = registry[code];
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
