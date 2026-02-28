import { HttpException } from '@nestjs/common';
import { ErrorResponse } from './interfaces/error-response.interface.js';

interface ErrorDefinition {
  status: number;
  details: string;
  message: string;
}

export const ERROR_CODES: Record<string, ErrorDefinition> = {
  'BUS-001': {
    status: 400,
    details: 'VALIDATION_ERROR',
    message: 'The request body is invalid',
  },
  'BUS-002': {
    status: 404,
    details: 'UPLOAD_NOT_FOUND',
    message: 'The requested upload was not found',
  },
  'BUS-003': {
    status: 400,
    details: 'INVALID_FILE_TYPE',
    message: 'Only .xlsx files are accepted',
  },
  'BUS-004': {
    status: 400,
    details: 'FILE_TOO_LARGE',
    message: 'File size exceeds the maximum allowed limit',
  },
  'BUS-005': {
    status: 400,
    details: 'MISSING_REQUIRED_COLUMN',
    message: "Missing required 'eventType' column",
  },
  'BUS-006': {
    status: 400,
    details: 'ROW_LIMIT_EXCEEDED',
    message: 'File exceeds the maximum row limit',
  },
  'BUS-007': {
    status: 400,
    details: 'EMPTY_FILE',
    message: 'File contains no data rows',
  },
  'BUS-008': {
    status: 409,
    details: 'INVALID_STATUS_TRANSITION',
    message: 'Invalid upload status transition',
  },
  'BUS-009': {
    status: 500,
    details: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  },
  'BUS-010': {
    status: 429,
    details: 'UPLOAD_RATE_LIMIT_EXCEEDED',
    message: 'Too many uploads, please try again later',
  },
  'BUS-011': {
    status: 400,
    details: 'MISSING_HEADER_ROW',
    message: 'Missing header row in the uploaded file',
  },
  'BUS-012': {
    status: 400,
    details: 'MISSING_GROUP_KEY_COLUMN',
    message:
      "Group mode detected (item.* columns found) but required group key column is missing",
  },
  'BUS-013': {
    status: 400,
    details: 'INVALID_MIME_TYPE',
    message: 'Invalid MIME type — expected application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  'BUS-014': {
    status: 400,
    details: 'INVALID_UUID',
    message: 'The provided ID is not a valid UUID',
  },
  'BUS-015': {
    status: 409,
    details: 'RESULT_NOT_READY',
    message: 'Upload is still processing — result not yet available',
  },
  'BUS-016': {
    status: 409,
    details: 'RETRY_NOT_ALLOWED',
    message:
      'Upload cannot be retried — only partial or failed uploads can be retried',
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
