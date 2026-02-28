import { HttpException } from '@nestjs/common';
import { ERROR_CODES, createErrorResponse } from './errors.js';

describe('errors', () => {
  describe('ERROR_CODES', () => {
    it('should have BUS-001 through BUS-014 defined', () => {
      expect(ERROR_CODES['BUS-001']).toBeDefined();
      expect(ERROR_CODES['BUS-002']).toBeDefined();
      expect(ERROR_CODES['BUS-003']).toBeDefined();
      expect(ERROR_CODES['BUS-004']).toBeDefined();
      expect(ERROR_CODES['BUS-005']).toBeDefined();
      expect(ERROR_CODES['BUS-006']).toBeDefined();
      expect(ERROR_CODES['BUS-007']).toBeDefined();
      expect(ERROR_CODES['BUS-008']).toBeDefined();
      expect(ERROR_CODES['BUS-009']).toBeDefined();
      expect(ERROR_CODES['BUS-010']).toBeDefined();
      expect(ERROR_CODES['BUS-011']).toBeDefined();
      expect(ERROR_CODES['BUS-012']).toBeDefined();
      expect(ERROR_CODES['BUS-013']).toBeDefined();
      expect(ERROR_CODES['BUS-014']).toBeDefined();
    });

    it('should have no duplicate error codes', () => {
      const codes = Object.keys(ERROR_CODES);
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);
    });

    it('should have all codes prefixed with BUS-', () => {
      for (const code of Object.keys(ERROR_CODES)) {
        expect(code).toMatch(/^BUS-\d{3}$/);
      }
    });

    it('should have valid HTTP status codes', () => {
      for (const [, def] of Object.entries(ERROR_CODES)) {
        expect(def.status).toBeGreaterThanOrEqual(400);
        expect(def.status).toBeLessThan(600);
      }
    });

    it('should have non-empty details and message for each code', () => {
      for (const [, def] of Object.entries(ERROR_CODES)) {
        expect(def.details).toBeTruthy();
        expect(def.message).toBeTruthy();
      }
    });
  });

  describe('createErrorResponse', () => {
    it('should create an HttpException with correct status', () => {
      const error = createErrorResponse('BUS-002');
      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(404);
    });

    it('should include code, details, message, and status in body', () => {
      const error = createErrorResponse('BUS-001');
      const body = error.getResponse() as any;
      expect(body.code).toBe('BUS-001');
      expect(body.details).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('The request body is invalid');
      expect(body.status).toBe(400);
    });

    it('should allow message override', () => {
      const error = createErrorResponse('BUS-004', 'File too big');
      const body = error.getResponse() as any;
      expect(body.message).toBe('File too big');
      expect(body.code).toBe('BUS-004');
    });

    it('should throw for unknown error code', () => {
      expect(() => createErrorResponse('BUS-999')).toThrow(
        'Unknown error code: BUS-999',
      );
    });

    it('should return 400 for BUS-003 (invalid file type)', () => {
      const error = createErrorResponse('BUS-003');
      expect(error.getStatus()).toBe(400);
    });

    it('should return 409 for BUS-008 (invalid status transition)', () => {
      const error = createErrorResponse('BUS-008');
      expect(error.getStatus()).toBe(409);
    });

    it('should return 429 for BUS-010 (rate limit)', () => {
      const error = createErrorResponse('BUS-010');
      expect(error.getStatus()).toBe(429);
    });

    it('should return 500 for BUS-009 (internal error)', () => {
      const error = createErrorResponse('BUS-009');
      expect(error.getStatus()).toBe(500);
    });
  });
});
