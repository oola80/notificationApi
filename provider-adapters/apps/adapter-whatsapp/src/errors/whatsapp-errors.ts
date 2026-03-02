import { ErrorDefinition, BASE_ERROR_CODES } from '@app/common';

export const WHATSAPP_ERROR_CODES: Record<string, ErrorDefinition> = {
  ...BASE_ERROR_CODES,
  'WA-001': {
    status: 400,
    details: 'INVALID_REQUEST_BODY',
    message: 'The request body is invalid',
  },
  'WA-002': {
    status: 503,
    details: 'WHATSAPP_API_UNAVAILABLE',
    message: 'The WhatsApp Cloud API is unavailable',
  },
  'WA-003': {
    status: 502,
    details: 'SEND_FAILED',
    message: 'Failed to send message via WhatsApp',
  },
  'WA-004': {
    status: 401,
    details: 'INVALID_ACCESS_TOKEN',
    message: 'The Meta access token is invalid or expired',
  },
  'WA-005': {
    status: 400,
    details: 'INVALID_PHONE_NUMBER',
    message: 'The recipient phone number is invalid or not on WhatsApp',
  },
  'WA-006': {
    status: 404,
    details: 'TEMPLATE_NOT_FOUND',
    message: 'The WhatsApp message template was not found or not approved',
  },
  'WA-007': {
    status: 429,
    details: 'RATE_LIMIT_EXCEEDED',
    message: 'WhatsApp Cloud API rate limit exceeded',
  },
  'WA-008': {
    status: 400,
    details: 'TEMPLATE_PARAMETER_MISMATCH',
    message: 'Template parameter count does not match the template definition',
  },
  'WA-009': {
    status: 403,
    details: 'POLICY_VIOLATION',
    message: 'Account temporarily blocked for policy violations',
  },
  'WA-010': {
    status: 400,
    details: 'CONVERSATION_WINDOW_EXPIRED',
    message:
      'The 24-hour conversation window has expired; use a template message',
  },
};
