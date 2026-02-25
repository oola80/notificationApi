import { HttpException } from '@nestjs/common';
import { createErrorResponse, ERROR_CODES } from './errors.js';

describe('errors', () => {
  describe('createErrorResponse', () => {
    it('should return HttpException with correct body for valid code', () => {
      const exception = createErrorResponse('NES-001');

      expect(exception).toBeInstanceOf(HttpException);
      expect(exception.getStatus()).toBe(400);

      const body = exception.getResponse() as any;
      expect(body.code).toBe('NES-001');
      expect(body.details).toBe('INVALID_REQUEST_BODY');
      expect(body.message).toBe('The request body is invalid');
      expect(body.status).toBe(400);
    });

    it('should allow message override', () => {
      const exception = createErrorResponse('NES-002', 'Custom message');

      const body = exception.getResponse() as any;
      expect(body.message).toBe('Custom message');
      expect(body.code).toBe('NES-002');
    });

    it('should throw Error for unknown error code', () => {
      expect(() => createErrorResponse('NES-999')).toThrow(
        'Unknown error code: NES-999',
      );
    });

    it('should have unique error codes', () => {
      const codes = Object.keys(ERROR_CODES);
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);
    });

    it('should have NES- prefix for all error codes', () => {
      Object.keys(ERROR_CODES).forEach((code) => {
        expect(code).toMatch(/^NES-\d{3}$/);
      });
    });
  });
});
