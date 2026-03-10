import { ErrorDefinition, BASE_ERROR_CODES } from '@app/common';

export const BRAZE_ERROR_CODES: Record<string, ErrorDefinition> = {
  ...BASE_ERROR_CODES,
  'BZ-001': {
    status: 400,
    details: 'INVALID_REQUEST_BODY',
    message: 'The request body is invalid',
  },
  'BZ-002': {
    status: 503,
    details: 'BRAZE_API_UNAVAILABLE',
    message: 'The Braze API is unavailable',
  },
  'BZ-003': {
    status: 401,
    details: 'AUTHENTICATION_FAILED',
    message: 'Braze API key authentication failed',
  },
  'BZ-004': {
    status: 429,
    details: 'RATE_LIMIT_EXCEEDED',
    message: 'Braze API rate limit exceeded',
  },
  'BZ-005': {
    status: 400,
    details: 'UNSUPPORTED_CHANNEL',
    message: 'The requested channel is not supported by the Braze adapter',
  },
  'BZ-006': {
    status: 502,
    details: 'PROFILE_SYNC_FAILED',
    message: 'Failed to sync user profile to Braze',
  },
  'BZ-007': {
    status: 404,
    details: 'USER_NOT_FOUND',
    message: 'User not found in Braze',
  },
  'BZ-008': {
    status: 401,
    details: 'WEBHOOK_VERIFICATION_FAILED',
    message: 'Braze webhook verification failed',
  },
  'BZ-009': {
    status: 400,
    details: 'INVALID_WEBHOOK_PAYLOAD',
    message: 'The webhook payload is invalid or malformed',
  },
  'BZ-010': {
    status: 400,
    details: 'MISSING_SUBSCRIPTION_GROUP',
    message:
      'SMS or WhatsApp subscription group ID is required but not configured',
  },
};
