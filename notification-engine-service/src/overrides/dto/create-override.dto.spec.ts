import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateOverrideDto } from './create-override.dto.js';

function toDto(plain: Record<string, any>): CreateOverrideDto {
  return plainToInstance(CreateOverrideDto, plain);
}

function validPayload(): Record<string, any> {
  return { eventType: 'order.created', channel: 'email' };
}

describe('CreateOverrideDto', () => {
  it('should pass with valid payload', async () => {
    const errors = await validate(toDto(validPayload()));
    expect(errors).toHaveLength(0);
  });

  it('should pass with optional fields', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), reason: 'Compliance', createdBy: 'admin' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('should fail when eventType is missing', async () => {
    const errors = await validate(toDto({ channel: 'email' }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('eventType');
  });

  it('should fail when eventType exceeds 100 chars', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), eventType: 'x'.repeat(101) }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('eventType');
  });

  it('should fail when channel is invalid', async () => {
    const errors = await validate(
      toDto({ eventType: 'order.created', channel: 'telegram' }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'channel')).toBe(true);
  });

  it('should fail when channel is missing', async () => {
    const errors = await validate(toDto({ eventType: 'order.created' }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'channel')).toBe(true);
  });

  it('should fail when createdBy exceeds 100 chars', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), createdBy: 'x'.repeat(101) }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'createdBy')).toBe(true);
  });
});
