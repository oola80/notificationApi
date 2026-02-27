import { ErrorDefinition, BASE_ERROR_CODES } from '@app/common';

export const MAILGUN_ERROR_CODES: Record<string, ErrorDefinition> = {
  ...BASE_ERROR_CODES,
  'MG-001': {
    status: 400,
    details: 'INVALID_REQUEST_BODY',
    message: 'The request body is invalid',
  },
  'MG-002': {
    status: 503,
    details: 'MAILGUN_API_UNAVAILABLE',
    message: 'The Mailgun API is unavailable',
  },
  'MG-003': {
    status: 502,
    details: 'SEND_FAILED',
    message: 'Failed to send email via Mailgun',
  },
  'MG-004': {
    status: 401,
    details: 'WEBHOOK_VERIFICATION_FAILED',
    message: 'Mailgun webhook signature verification failed',
  },
  'MG-005': {
    status: 401,
    details: 'INVALID_API_KEY',
    message: 'The Mailgun API key is invalid',
  },
  'MG-006': {
    status: 404,
    details: 'DOMAIN_NOT_FOUND',
    message: 'The Mailgun sending domain was not found',
  },
  'MG-007': {
    status: 429,
    details: 'RATE_LIMIT_EXCEEDED',
    message: 'Mailgun rate limit exceeded',
  },
  'MG-008': {
    status: 413,
    details: 'ATTACHMENT_TOO_LARGE',
    message: 'Attachment exceeds maximum size (25 MB)',
  },
  'MG-009': {
    status: 400,
    details: 'INVALID_RECIPIENT',
    message: 'The recipient email address is invalid',
  },
  'MG-010': {
    status: 500,
    details: 'RABBITMQ_PUBLISH_FAILED',
    message: 'Failed to publish webhook event to RabbitMQ',
  },
};
