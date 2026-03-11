import { SES_ERROR_CODES } from './ses-errors.js';
import { createErrorResponse } from '@app/common';

describe('SES_ERROR_CODES', () => {
  it('should have all SES- prefixed error codes', () => {
    const sesCodes = Object.keys(SES_ERROR_CODES).filter((c) =>
      c.startsWith('SES-'),
    );
    expect(sesCodes).toContain('SES-001');
    expect(sesCodes).toContain('SES-002');
    expect(sesCodes).toContain('SES-003');
    expect(sesCodes).toContain('SES-004');
    expect(sesCodes).toContain('SES-005');
    expect(sesCodes).toContain('SES-006');
    expect(sesCodes).toContain('SES-007');
    expect(sesCodes).toContain('SES-008');
    expect(sesCodes).toContain('SES-009');
    expect(sesCodes).toContain('SES-010');
    expect(sesCodes.length).toBe(10);
  });

  it('should include base PA- error codes', () => {
    const paCodes = Object.keys(SES_ERROR_CODES).filter((c) =>
      c.startsWith('PA-'),
    );
    expect(paCodes.length).toBeGreaterThan(0);
  });

  it('should have valid status, details, and message for each SES code', () => {
    const sesCodes = Object.entries(SES_ERROR_CODES).filter(([c]) =>
      c.startsWith('SES-'),
    );
    for (const [, def] of sesCodes) {
      expect(def.status).toBeGreaterThanOrEqual(400);
      expect(def.details).toBeTruthy();
      expect(def.message).toBeTruthy();
    }
  });

  it('should work with createErrorResponse', () => {
    const error = createErrorResponse('SES-002', SES_ERROR_CODES);
    expect(error.getStatus()).toBe(503);
    const body = error.getResponse() as any;
    expect(body.code).toBe('SES-002');
    expect(body.details).toBe('SES_API_UNAVAILABLE');
  });
});
