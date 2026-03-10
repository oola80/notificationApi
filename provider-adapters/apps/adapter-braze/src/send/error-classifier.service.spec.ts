import { ErrorClassifierService } from './error-classifier.service.js';

describe('ErrorClassifierService', () => {
  let service: ErrorClassifierService;

  beforeEach(() => {
    service = new ErrorClassifierService();
  });

  describe('HTTP status code mapping', () => {
    it('should classify 400 as non-retryable BZ-001', () => {
      const error = makeAxiosError(400, 'Bad Request');
      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('BZ-001');
      expect(result.httpStatus).toBe(400);
    });

    it('should classify 401 as non-retryable BZ-003', () => {
      const error = makeAxiosError(401, 'Unauthorized');
      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('BZ-003');
      expect(result.httpStatus).toBe(401);
      expect(result.errorMessage).toBe('Invalid Braze API key');
    });

    it('should classify 429 as retryable BZ-004', () => {
      const error = makeAxiosError(429, 'Too Many Requests');
      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('BZ-004');
      expect(result.httpStatus).toBe(429);
    });

    it('should classify 500 as retryable BZ-002', () => {
      const error = makeAxiosError(500, 'Internal Server Error');
      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('BZ-002');
      expect(result.httpStatus).toBe(500);
    });

    it('should classify 503 as retryable BZ-002', () => {
      const error = makeAxiosError(503, 'Service Unavailable');
      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('BZ-002');
      expect(result.httpStatus).toBe(503);
    });

    it('should classify unknown status as non-retryable PA-003', () => {
      const error = makeAxiosError(418, "I'm a teapot");
      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('PA-003');
      expect(result.httpStatus).toBe(418);
    });
  });

  describe('201-with-errors (partial error)', () => {
    it('should classify as non-retryable BZ-007', () => {
      const error = new Error('Braze send returned errors: No valid users') as any;
      error.isBrazePartialError = true;
      error.brazeErrors = [{ type: 'error', message: 'No valid users' }];

      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('BZ-007');
      expect(result.errorMessage).toContain('No valid users');
    });
  });

  describe('network errors', () => {
    it('should classify ECONNREFUSED as retryable', () => {
      const error = new Error('Connection refused') as any;
      error.code = 'ECONNREFUSED';
      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('BZ-002');
    });

    it('should classify ETIMEDOUT as retryable', () => {
      const error = new Error('Timed out') as any;
      error.code = 'ETIMEDOUT';
      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('BZ-002');
    });

    it('should classify ECONNABORTED as retryable', () => {
      const error = new Error('Connection aborted') as any;
      error.code = 'ECONNABORTED';
      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('BZ-002');
    });

    it('should classify ECONNRESET as retryable', () => {
      const error = new Error('Connection reset') as any;
      error.code = 'ECONNRESET';
      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
    });

    it('should classify ENOTFOUND as retryable', () => {
      const error = new Error('DNS not found') as any;
      error.code = 'ENOTFOUND';
      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
    });
  });

  describe('axios error without response (network-level)', () => {
    it('should classify timeout axios error as retryable', () => {
      const error = new Error('timeout of 10000ms exceeded') as any;
      error.isAxiosError = true;
      error.code = 'ECONNABORTED';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('BZ-002');
      expect(result.httpStatus).toBe(503);
    });

    it('should classify unknown axios error without response as non-retryable', () => {
      const error = new Error('Something weird') as any;
      error.isAxiosError = true;

      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('PA-003');
    });
  });

  describe('generic errors', () => {
    it('should classify unknown error as non-retryable PA-003', () => {
      const error = new Error('Something unexpected');
      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('PA-003');
      expect(result.httpStatus).toBe(502);
    });
  });

  function makeAxiosError(status: number, message: string): any {
    const error = new Error(message) as any;
    error.isAxiosError = true;
    error.response = {
      status,
      data: { message },
      headers: {},
      statusText: message,
      config: {},
    };
    error.config = {};
    return error;
  }
});
