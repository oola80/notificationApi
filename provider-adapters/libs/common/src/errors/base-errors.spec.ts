import { HttpException } from '@nestjs/common';
import {
  BASE_ERROR_CODES,
  createErrorResponse,
  ErrorDefinition,
} from './base-errors.js';

describe('BASE_ERROR_CODES', () => {
  it('should have all PA- prefixed error codes', () => {
    const codes = Object.keys(BASE_ERROR_CODES);
    expect(codes).toContain('PA-001');
    expect(codes).toContain('PA-002');
    expect(codes).toContain('PA-003');
    expect(codes).toContain('PA-004');
    expect(codes).toContain('PA-005');
    expect(codes).toContain('PA-006');
    expect(codes).toContain('PA-007');
  });

  it('should have valid status, details, and message for each code', () => {
    for (const [code, def] of Object.entries(BASE_ERROR_CODES)) {
      expect(def.status).toBeGreaterThanOrEqual(400);
      expect(def.details).toBeTruthy();
      expect(def.message).toBeTruthy();
    }
  });

  it('should not have duplicate error codes', () => {
    const codes = Object.keys(BASE_ERROR_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('createErrorResponse', () => {
  it('should create an HttpException with correct status and body', () => {
    const error = createErrorResponse('PA-001', BASE_ERROR_CODES);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(400);

    const body = error.getResponse() as any;
    expect(body.code).toBe('PA-001');
    expect(body.details).toBe('INVALID_REQUEST_BODY');
    expect(body.message).toBe('The request body is invalid');
    expect(body.status).toBe(400);
  });

  it('should use messageOverride when provided', () => {
    const error = createErrorResponse(
      'PA-002',
      BASE_ERROR_CODES,
      'Custom message',
    );
    const body = error.getResponse() as any;
    expect(body.message).toBe('Custom message');
  });

  it('should throw for unknown error code', () => {
    expect(() =>
      createErrorResponse('UNKNOWN-999', BASE_ERROR_CODES),
    ).toThrow('Unknown error code: UNKNOWN-999');
  });

  it('should work with a custom error registry', () => {
    const customRegistry: Record<string, ErrorDefinition> = {
      'CUSTOM-001': {
        status: 418,
        details: 'IM_A_TEAPOT',
        message: 'I am a teapot',
      },
    };
    const error = createErrorResponse('CUSTOM-001', customRegistry);
    expect(error.getStatus()).toBe(418);
  });
});
