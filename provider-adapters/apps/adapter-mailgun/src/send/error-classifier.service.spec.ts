import { ErrorClassifierService } from './error-classifier.service.js';
import { AxiosError } from 'axios';

describe('ErrorClassifierService', () => {
  let service: ErrorClassifierService;

  beforeEach(() => {
    service = new ErrorClassifierService();
  });

  function makeAxiosError(
    status: number,
    data?: any,
    message?: string,
  ): AxiosError {
    const error = new Error(message ?? `Request failed with status ${status}`) as any;
    error.isAxiosError = true;
    error.response = {
      status,
      data: data ?? { message: `Error ${status}` },
      headers: {},
      statusText: '',
      config: {} as any,
    };
    error.config = {} as any;
    return error;
  }

  function makeNetworkError(code: string, message?: string): any {
    const error = new Error(message ?? `Network error: ${code}`) as any;
    error.isAxiosError = true;
    error.code = code;
    error.config = {} as any;
    // No response property for network errors
    return error;
  }

  describe('HTTP 400 — Invalid Recipient', () => {
    it('should classify as non-retryable MG-009', () => {
      const result = service.classifyError(
        makeAxiosError(400, { message: 'to parameter is not a valid address' }),
      );

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('MG-009');
      expect(result.httpStatus).toBe(400);
    });
  });

  describe('HTTP 401 — Invalid API Key', () => {
    it('should classify as non-retryable MG-005', () => {
      const result = service.classifyError(
        makeAxiosError(401, { message: 'Forbidden' }),
      );

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('MG-005');
      expect(result.httpStatus).toBe(401);
      expect(result.errorMessage).toBe('Invalid Mailgun API key');
    });
  });

  describe('HTTP 402 — Account Suspended', () => {
    it('should classify as non-retryable MG-003', () => {
      const result = service.classifyError(
        makeAxiosError(402, { message: 'Payment Required' }),
      );

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('MG-003');
      expect(result.httpStatus).toBe(402);
    });
  });

  describe('HTTP 404 — Domain Not Found', () => {
    it('should classify as non-retryable MG-006', () => {
      const result = service.classifyError(
        makeAxiosError(404, { message: 'Domain not found' }),
      );

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('MG-006');
      expect(result.httpStatus).toBe(404);
      expect(result.errorMessage).toBe('Mailgun sending domain not found');
    });
  });

  describe('HTTP 413 — Attachment Too Large', () => {
    it('should classify as non-retryable MG-008', () => {
      const result = service.classifyError(
        makeAxiosError(413, { message: 'Request Entity Too Large' }),
      );

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('MG-008');
      expect(result.httpStatus).toBe(413);
    });
  });

  describe('HTTP 429 — Rate Limited', () => {
    it('should classify as retryable MG-007', () => {
      const result = service.classifyError(
        makeAxiosError(429, { message: 'Too Many Requests' }),
      );

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('MG-007');
      expect(result.httpStatus).toBe(429);
      expect(result.errorMessage).toBe('Mailgun rate limit exceeded');
    });
  });

  describe('HTTP 500 — Server Error', () => {
    it('should classify as retryable MG-002', () => {
      const result = service.classifyError(
        makeAxiosError(500, { message: 'Internal Server Error' }),
      );

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('MG-002');
      expect(result.httpStatus).toBe(500);
    });
  });

  describe('HTTP 502 — Bad Gateway', () => {
    it('should classify as retryable MG-002', () => {
      const result = service.classifyError(makeAxiosError(502));

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('MG-002');
      expect(result.httpStatus).toBe(502);
    });
  });

  describe('HTTP 503 — Service Unavailable', () => {
    it('should classify as retryable MG-002', () => {
      const result = service.classifyError(makeAxiosError(503));

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('MG-002');
      expect(result.httpStatus).toBe(503);
    });
  });

  describe('Network errors', () => {
    it('should classify ECONNREFUSED as retryable MG-002', () => {
      const result = service.classifyError(makeNetworkError('ECONNREFUSED'));

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('MG-002');
    });

    it('should classify ENOTFOUND as retryable MG-002', () => {
      const result = service.classifyError(makeNetworkError('ENOTFOUND'));

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('MG-002');
    });

    it('should classify ETIMEDOUT as retryable MG-002', () => {
      const result = service.classifyError(makeNetworkError('ETIMEDOUT'));

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('MG-002');
    });

    it('should classify ECONNRESET as retryable MG-002', () => {
      const result = service.classifyError(makeNetworkError('ECONNRESET'));

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('MG-002');
    });

    it('should classify ECONNABORTED as retryable MG-002', () => {
      const result = service.classifyError(makeNetworkError('ECONNABORTED'));

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('MG-002');
    });

    it('should classify timeout message as retryable MG-002', () => {
      const error = new Error('timeout of 10000ms exceeded') as any;
      error.isAxiosError = true;
      error.config = {};

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('MG-002');
    });
  });

  describe('Non-Axios errors', () => {
    it('should classify unknown Error as non-retryable MG-003', () => {
      const result = service.classifyError(new Error('Something went wrong'));

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('MG-003');
      expect(result.httpStatus).toBe(502);
      expect(result.errorMessage).toBe('Something went wrong');
    });

    it('should classify network code Error as retryable MG-002', () => {
      const error = new Error('connect ECONNREFUSED') as any;
      error.code = 'ECONNREFUSED';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('MG-002');
    });
  });

  describe('Unknown HTTP status', () => {
    it('should classify unknown status as non-retryable MG-003', () => {
      const result = service.classifyError(makeAxiosError(418));

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('MG-003');
    });
  });
});
