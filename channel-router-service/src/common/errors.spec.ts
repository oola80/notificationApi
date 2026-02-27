import { HttpException } from '@nestjs/common';
import { ERROR_CODES, createErrorResponse } from './errors.js';

describe('ErrorCodes', () => {
  it('should have all CRS- prefixed error codes', () => {
    const codes = Object.keys(ERROR_CODES);
    expect(codes.length).toBeGreaterThanOrEqual(20);
    codes.forEach((code) => {
      expect(code).toMatch(/^CRS-\d{3}$/);
    });
  });

  it('should have no duplicate error codes', () => {
    const codes = Object.keys(ERROR_CODES);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('should have no duplicate details values', () => {
    const details = Object.values(ERROR_CODES).map((e) => e.details);
    const unique = new Set(details);
    expect(unique.size).toBe(details.length);
  });

  it('should have valid HTTP status for each code', () => {
    Object.values(ERROR_CODES).forEach((def) => {
      expect(def.status).toBeGreaterThanOrEqual(200);
      expect(def.status).toBeLessThan(600);
    });
  });

  it('should have non-empty message for each code', () => {
    Object.values(ERROR_CODES).forEach((def) => {
      expect(def.message.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty details for each code', () => {
    Object.values(ERROR_CODES).forEach((def) => {
      expect(def.details.length).toBeGreaterThan(0);
    });
  });
});

describe('createErrorResponse', () => {
  it('should create an HttpException with correct status', () => {
    const error = createErrorResponse('CRS-001');
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(400);
  });

  it('should include code, details, message, status in response body', () => {
    const error = createErrorResponse('CRS-002');
    const body = error.getResponse() as Record<string, any>;

    expect(body.code).toBe('CRS-002');
    expect(body.details).toBe('ADAPTER_UNAVAILABLE');
    expect(body.message).toBe('The adapter service is unavailable');
    expect(body.status).toBe(503);
  });

  it('should allow message override', () => {
    const error = createErrorResponse('CRS-003', 'Custom message');
    const body = error.getResponse() as Record<string, any>;

    expect(body.message).toBe('Custom message');
    expect(body.code).toBe('CRS-003');
  });

  it('should throw for unknown error code', () => {
    expect(() => createErrorResponse('CRS-999')).toThrow(
      'Unknown error code: CRS-999',
    );
  });
});
