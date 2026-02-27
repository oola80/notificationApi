import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateChannelConfigDto } from './update-channel-config.dto.js';

describe('UpdateChannelConfigDto', () => {
  function toDto(data: Record<string, any>): UpdateChannelConfigDto {
    return plainToInstance(UpdateChannelConfigDto, data);
  }

  it('should accept valid routing modes', async () => {
    for (const mode of ['primary', 'weighted', 'failover']) {
      const dto = toDto({ routingMode: mode });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('should reject invalid routing mode', async () => {
    const dto = toDto({ routingMode: 'invalid' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid UUID for activeProviderId', async () => {
    const dto = toDto({
      activeProviderId: 'a1111111-1111-4111-8111-111111111111',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject non-UUID activeProviderId', async () => {
    const dto = toDto({ activeProviderId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept boolean isActive', async () => {
    const dto = toDto({ isActive: false });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept empty dto (all optional)', async () => {
    const dto = toDto({});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept valid UUID for fallbackChannelId', async () => {
    const dto = toDto({
      fallbackChannelId: 'b2222222-2222-4222-8222-222222222222',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
