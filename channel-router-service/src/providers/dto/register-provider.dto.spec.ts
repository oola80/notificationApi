import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterProviderDto } from './register-provider.dto.js';

describe('RegisterProviderDto', () => {
  function toDto(data: Record<string, any>): RegisterProviderDto {
    return plainToInstance(RegisterProviderDto, data);
  }

  const validData = {
    providerName: 'SendGrid',
    providerId: 'sendgrid',
    channel: 'email',
    adapterUrl: 'http://adapter-sendgrid:3170',
  };

  it('should accept valid data with all required fields', async () => {
    const dto = toDto(validData);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept valid data with all optional fields', async () => {
    const dto = toDto({
      ...validData,
      isActive: true,
      routingWeight: 80,
      rateLimitTokensPerSec: 100,
      rateLimitMaxBurst: 200,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject empty providerName', async () => {
    const dto = toDto({ ...validData, providerName: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing providerId', async () => {
    const { providerId, ...rest } = validData;
    const dto = toDto(rest);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept all valid channel types', async () => {
    for (const channel of ['email', 'sms', 'whatsapp', 'push']) {
      const dto = toDto({ ...validData, channel });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('should reject invalid channel', async () => {
    const dto = toDto({ ...validData, channel: 'fax' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject empty adapter URL', async () => {
    const dto = toDto({ ...validData, adapterUrl: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject routingWeight > 100', async () => {
    const dto = toDto({ ...validData, routingWeight: 101 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject routingWeight < 0', async () => {
    const dto = toDto({ ...validData, routingWeight: -1 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject rateLimitTokensPerSec < 1', async () => {
    const dto = toDto({ ...validData, rateLimitTokensPerSec: 0 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject providerName exceeding 50 chars', async () => {
    const dto = toDto({ ...validData, providerName: 'x'.repeat(51) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
