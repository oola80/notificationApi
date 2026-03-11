import { ErrorClassifierService } from './error-classifier.service.js';

describe('ErrorClassifierService', () => {
  let service: ErrorClassifierService;

  beforeEach(() => {
    service = new ErrorClassifierService();
  });

  describe('Authentication errors', () => {
    it('should classify EAUTH as non-retryable SES-004', () => {
      const error = new Error('Invalid login') as any;
      error.code = 'EAUTH';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-004');
      expect(result.httpStatus).toBe(401);
    });

    it('should classify "Invalid login" message as SES-004', () => {
      const result = service.classifyError(new Error('Invalid login'));

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-004');
    });

    it('should classify "Authentication" message as SES-004', () => {
      const result = service.classifyError(
        new Error('Authentication credentials invalid'),
      );

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-004');
    });
  });

  describe('Throttling / rate limit errors', () => {
    it('should classify "Maximum sending rate exceeded" as retryable SES-006', () => {
      const result = service.classifyError(
        new Error('Maximum sending rate exceeded'),
      );

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-006');
      expect(result.httpStatus).toBe(429);
    });

    it('should classify "Throttling" as retryable SES-006', () => {
      const result = service.classifyError(new Error('Throttling'));

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-006');
    });

    it('should classify "Daily message quota exceeded" as retryable SES-006', () => {
      const result = service.classifyError(
        new Error('Daily message quota exceeded'),
      );

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-006');
    });
  });

  describe('Message rejected errors', () => {
    it('should classify "MessageRejected" as non-retryable SES-007', () => {
      const result = service.classifyError(new Error('MessageRejected'));

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-007');
      expect(result.httpStatus).toBe(400);
    });

    it('should classify EMESSAGE code as SES-007', () => {
      const error = new Error('Message could not be sent') as any;
      error.code = 'EMESSAGE';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-007');
    });
  });

  describe('Domain not verified errors', () => {
    it('should classify "not verified" as non-retryable SES-005', () => {
      const result = service.classifyError(
        new Error('Email address is not verified'),
      );

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-005');
      expect(result.httpStatus).toBe(400);
    });

    it('should classify "MailFromDomainNotVerified" as SES-005', () => {
      const result = service.classifyError(
        new Error('MailFromDomainNotVerified'),
      );

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-005');
    });
  });

  describe('Account sending paused errors', () => {
    it('should classify "AccountSendingPaused" as non-retryable SES-008', () => {
      const result = service.classifyError(
        new Error('AccountSendingPaused'),
      );

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-008');
      expect(result.httpStatus).toBe(403);
    });
  });

  describe('Network errors', () => {
    it('should classify ECONNREFUSED as retryable SES-002', () => {
      const error = new Error('connect ECONNREFUSED') as any;
      error.code = 'ECONNREFUSED';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-002');
      expect(result.httpStatus).toBe(503);
    });

    it('should classify ENOTFOUND as retryable SES-002', () => {
      const error = new Error('getaddrinfo ENOTFOUND') as any;
      error.code = 'ENOTFOUND';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-002');
    });

    it('should classify ECONNRESET as retryable SES-002', () => {
      const error = new Error('connection reset') as any;
      error.code = 'ECONNRESET';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-002');
    });

    it('should classify ECONNABORTED as retryable SES-002', () => {
      const error = new Error('connection aborted') as any;
      error.code = 'ECONNABORTED';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-002');
    });
  });

  describe('Timeout errors', () => {
    it('should classify ETIMEDOUT as retryable SES-002', () => {
      const error = new Error('connect ETIMEDOUT') as any;
      error.code = 'ETIMEDOUT';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-002');
      expect(result.httpStatus).toBe(503);
    });

    it('should classify ESOCKET as retryable SES-002', () => {
      const error = new Error('socket error') as any;
      error.code = 'ESOCKET';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-002');
    });

    it('should classify timeout message as retryable SES-002', () => {
      const result = service.classifyError(
        new Error('Connection timeout after 10000ms'),
      );

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-002');
    });
  });

  describe('Invalid recipient errors', () => {
    it('should classify "Invalid address" as non-retryable SES-010', () => {
      const result = service.classifyError(
        new Error('Invalid address: bad@'),
      );

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-010');
      expect(result.httpStatus).toBe(400);
    });
  });

  describe('AWS SDK — ThrottlingException', () => {
    it('should classify ThrottlingException as retryable SES-006', () => {
      const error = new Error('Rate exceeded') as any;
      error.name = 'ThrottlingException';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-006');
      expect(result.httpStatus).toBe(429);
    });

    it('should classify TooManyRequestsException as retryable SES-006', () => {
      const error = new Error('Too many requests') as any;
      error.name = 'TooManyRequestsException';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-006');
    });
  });

  describe('AWS SDK — MessageRejected', () => {
    it('should classify MessageRejected (named) as non-retryable SES-007', () => {
      const error = new Error('Email content rejected') as any;
      error.name = 'MessageRejected';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-007');
      expect(result.httpStatus).toBe(400);
    });
  });

  describe('AWS SDK — AccountSendingPausedException', () => {
    it('should classify AccountSendingPausedException as non-retryable SES-008', () => {
      const error = new Error('Sending paused') as any;
      error.name = 'AccountSendingPausedException';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-008');
      expect(result.httpStatus).toBe(403);
    });
  });

  describe('AWS SDK — MailFromDomainNotVerifiedException', () => {
    it('should classify MailFromDomainNotVerifiedException as non-retryable SES-005', () => {
      const error = new Error('Domain not verified') as any;
      error.name = 'MailFromDomainNotVerifiedException';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-005');
      expect(result.httpStatus).toBe(400);
    });
  });

  describe('AWS SDK — NotFoundException / BadRequestException', () => {
    it('should classify NotFoundException as non-retryable SES-007', () => {
      const error = new Error('Resource not found') as any;
      error.name = 'NotFoundException';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-007');
      expect(result.httpStatus).toBe(400);
    });

    it('should classify BadRequestException as non-retryable SES-007', () => {
      const error = new Error('Bad request') as any;
      error.name = 'BadRequestException';

      const result = service.classifyError(error);

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-007');
    });
  });

  describe('AWS SDK — generic 5xx server error', () => {
    it('should classify 5xx SESv2 errors as retryable SES-002', () => {
      const error = new Error('Internal server error') as any;
      error.name = 'InternalServiceErrorException';
      error.$metadata = { httpStatusCode: 500 };

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-002');
      expect(result.httpStatus).toBe(503);
    });

    it('should classify 503 service unavailable as retryable SES-002', () => {
      const error = new Error('Service unavailable') as any;
      error.$metadata = { httpStatusCode: 503 };

      const result = service.classifyError(error);

      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe('SES-002');
    });
  });

  describe('Unknown errors', () => {
    it('should classify unknown Error as non-retryable SES-003', () => {
      const result = service.classifyError(new Error('Something went wrong'));

      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe('SES-003');
      expect(result.httpStatus).toBe(502);
      expect(result.errorMessage).toBe('Something went wrong');
    });
  });
});
