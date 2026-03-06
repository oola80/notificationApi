import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpsertPreferenceDto } from './upsert-preference.dto.js';

function toDto(plain: Record<string, any>): UpsertPreferenceDto {
  return plainToInstance(UpsertPreferenceDto, plain);
}

function validPayload(): Record<string, any> {
  return { customerId: 'cust-1', channel: 'email', isOptedIn: true };
}

describe('UpsertPreferenceDto', () => {
  it('should pass with valid payload', async () => {
    const errors = await validate(toDto(validPayload()));
    expect(errors).toHaveLength(0);
  });

  it('should pass with optional sourceSystem', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), sourceSystem: 'shopify' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('should fail when customerId is missing', async () => {
    const { customerId: _, ...payload } = validPayload();
    const errors = await validate(toDto(payload));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('customerId');
  });

  it('should fail when customerId exceeds 100 chars', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), customerId: 'x'.repeat(101) }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('customerId');
  });

  it('should fail with invalid channel', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), channel: 'telegram' }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'channel')).toBe(true);
  });

  it('should fail when isOptedIn is missing', async () => {
    const errors = await validate(
      toDto({ customerId: 'cust-1', channel: 'email' }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'isOptedIn')).toBe(true);
  });

  it('should fail when isOptedIn is not boolean', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), isOptedIn: 'yes' }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'isOptedIn')).toBe(true);
  });

  it('should fail when sourceSystem exceeds 50 chars', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), sourceSystem: 'x'.repeat(51) }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'sourceSystem')).toBe(true);
  });
});
