import { ErrorDefinition, BASE_ERROR_CODES } from '@app/common';

export const SES_ERROR_CODES: Record<string, ErrorDefinition> = {
  ...BASE_ERROR_CODES,
  'SES-001': {
    status: 400,
    details: 'INVALID_REQUEST_BODY',
    message: 'The request body is invalid',
  },
  'SES-002': {
    status: 503,
    details: 'SES_API_UNAVAILABLE',
    message: 'The AWS SES API is unavailable',
  },
  'SES-003': {
    status: 502,
    details: 'SEND_FAILED',
    message: 'Failed to send email via AWS SES',
  },
  'SES-004': {
    status: 401,
    details: 'AUTHENTICATION_FAILED',
    message: 'AWS SES SMTP credentials are invalid',
  },
  'SES-005': {
    status: 400,
    details: 'DOMAIN_NOT_VERIFIED',
    message: 'The sending domain or address is not verified in SES',
  },
  'SES-006': {
    status: 429,
    details: 'RATE_LIMIT_EXCEEDED',
    message: 'AWS SES rate limit or sending quota exceeded',
  },
  'SES-007': {
    status: 400,
    details: 'MESSAGE_REJECTED',
    message: 'AWS SES rejected the message (content policy, virus, or sandbox)',
  },
  'SES-008': {
    status: 403,
    details: 'ACCOUNT_SENDING_PAUSED',
    message: 'AWS SES account sending is paused due to reputation issues',
  },
  'SES-009': {
    status: 401,
    details: 'WEBHOOK_VERIFICATION_FAILED',
    message: 'SNS signature verification failed',
  },
  'SES-010': {
    status: 400,
    details: 'INVALID_RECIPIENT',
    message: 'The recipient email address is invalid or unverified (sandbox)',
  },
};
