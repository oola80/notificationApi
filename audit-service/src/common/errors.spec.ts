import { HttpException } from '@nestjs/common';
import { ERROR_CODES, createErrorResponse } from './errors';

describe('Error Registry', () => {
  it('should define all AUD-prefixed error codes', () => {
    const codes = Object.keys(ERROR_CODES);
    expect(codes.length).toBeGreaterThanOrEqual(9);
    codes.forEach((code) => {
      expect(code).toMatch(/^AUD-\d{3}$/);
    });
  });

  it('should have no duplicate error codes', () => {
    const codes = Object.keys(ERROR_CODES);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('should have no duplicate details values', () => {
    const details = Object.values(ERROR_CODES).map((d) => d.details);
    const unique = new Set(details);
    expect(unique.size).toBe(details.length);
  });

  it('should define required properties for each error', () => {
    Object.entries(ERROR_CODES).forEach(([code, def]) => {
      expect(def.status).toBeGreaterThanOrEqual(400);
      expect(def.status).toBeLessThan(600);
      expect(def.details).toBeTruthy();
      expect(def.message).toBeTruthy();
    });
  });

  describe('createErrorResponse', () => {
    it('should create an HttpException with correct body', () => {
      const error = createErrorResponse('AUD-001');
      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(400);
      const response = error.getResponse() as any;
      expect(response.code).toBe('AUD-001');
      expect(response.details).toBe('VALIDATION_ERROR');
    });

    it('should allow message override', () => {
      const error = createErrorResponse('AUD-009', 'Custom message');
      const response = error.getResponse() as any;
      expect(response.message).toBe('Custom message');
    });

    it('should throw for unknown error code', () => {
      expect(() => createErrorResponse('AUD-999')).toThrow(
        'Unknown error code: AUD-999',
      );
    });
  });
});
