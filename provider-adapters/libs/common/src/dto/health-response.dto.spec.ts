import { AdapterHealthResponseDto } from './health-response.dto.js';

describe('AdapterHealthResponseDto', () => {
  it('should create a valid health response', () => {
    const dto = new AdapterHealthResponseDto();
    dto.status = 'ok';
    dto.providerId = 'mailgun';
    dto.providerName = 'Mailgun';
    dto.supportedChannels = ['email'];
    dto.latencyMs = 150;
    dto.details = { domain: 'distelsa.info' };

    expect(dto.status).toBe('ok');
    expect(dto.providerId).toBe('mailgun');
    expect(dto.supportedChannels).toEqual(['email']);
  });

  it('should allow degraded status', () => {
    const dto = new AdapterHealthResponseDto();
    dto.status = 'degraded';
    expect(dto.status).toBe('degraded');
  });

  it('should allow down status', () => {
    const dto = new AdapterHealthResponseDto();
    dto.status = 'down';
    expect(dto.status).toBe('down');
  });
});
