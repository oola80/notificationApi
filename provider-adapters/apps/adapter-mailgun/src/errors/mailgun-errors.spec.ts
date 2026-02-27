import { MAILGUN_ERROR_CODES } from './mailgun-errors.js';
import { createErrorResponse } from '@app/common';

describe('MAILGUN_ERROR_CODES', () => {
  it('should have all MG- prefixed error codes', () => {
    const mgCodes = Object.keys(MAILGUN_ERROR_CODES).filter((c) =>
      c.startsWith('MG-'),
    );
    expect(mgCodes).toContain('MG-001');
    expect(mgCodes).toContain('MG-002');
    expect(mgCodes).toContain('MG-003');
    expect(mgCodes).toContain('MG-004');
    expect(mgCodes).toContain('MG-005');
    expect(mgCodes).toContain('MG-006');
    expect(mgCodes).toContain('MG-007');
    expect(mgCodes).toContain('MG-008');
    expect(mgCodes).toContain('MG-009');
    expect(mgCodes).toContain('MG-010');
    expect(mgCodes.length).toBe(10);
  });

  it('should include base PA- error codes', () => {
    const paCodes = Object.keys(MAILGUN_ERROR_CODES).filter((c) =>
      c.startsWith('PA-'),
    );
    expect(paCodes.length).toBeGreaterThan(0);
  });

  it('should have valid status, details, and message for each MG code', () => {
    const mgCodes = Object.entries(MAILGUN_ERROR_CODES).filter(([c]) =>
      c.startsWith('MG-'),
    );
    for (const [, def] of mgCodes) {
      expect(def.status).toBeGreaterThanOrEqual(400);
      expect(def.details).toBeTruthy();
      expect(def.message).toBeTruthy();
    }
  });

  it('should work with createErrorResponse', () => {
    const error = createErrorResponse('MG-002', MAILGUN_ERROR_CODES);
    expect(error.getStatus()).toBe(503);
    const body = error.getResponse() as any;
    expect(body.code).toBe('MG-002');
    expect(body.details).toBe('MAILGUN_API_UNAVAILABLE');
  });
});
