import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProviderConfigDto } from './update-provider-config.dto.js';

describe('UpdateProviderConfigDto', () => {
  function toDto(data: Record<string, any>): UpdateProviderConfigDto {
    return plainToInstance(UpdateProviderConfigDto, data);
  }

  it('should accept empty dto (all optional)', async () => {
    const dto = toDto({});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept valid adapter URL', async () => {
    const dto = toDto({ adapterUrl: 'http://new-adapter:3170' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject empty adapter URL', async () => {
    const dto = toDto({ adapterUrl: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid routingWeight', async () => {
    const dto = toDto({ routingWeight: 50 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject routingWeight > 100', async () => {
    const dto = toDto({ routingWeight: 101 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid rateLimitTokensPerSec', async () => {
    const dto = toDto({ rateLimitTokensPerSec: 100 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject rateLimitTokensPerSec < 1', async () => {
    const dto = toDto({ rateLimitTokensPerSec: 0 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid rateLimitMaxBurst', async () => {
    const dto = toDto({ rateLimitMaxBurst: 200 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept boolean isActive', async () => {
    const dto = toDto({ isActive: false });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept all fields together', async () => {
    const dto = toDto({
      adapterUrl: 'http://adapter:3170',
      routingWeight: 80,
      rateLimitTokensPerSec: 100,
      rateLimitMaxBurst: 200,
      isActive: true,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
