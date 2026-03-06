import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BulkUpsertPreferencesDto } from './bulk-upsert-preferences.dto.js';

function toDto(plain: Record<string, any>): BulkUpsertPreferencesDto {
  return plainToInstance(BulkUpsertPreferencesDto, plain);
}

function validPref(index: number = 0): Record<string, any> {
  return {
    customerId: `cust-${index}`,
    channel: 'email',
    isOptedIn: true,
  };
}

describe('BulkUpsertPreferencesDto', () => {
  it('should pass with 1 preference', async () => {
    const errors = await validate(toDto({ preferences: [validPref()] }));
    expect(errors).toHaveLength(0);
  });

  it('should pass with 1000 preferences', async () => {
    const prefs = Array.from({ length: 1000 }, (_, i) => validPref(i));
    const errors = await validate(toDto({ preferences: prefs }));
    expect(errors).toHaveLength(0);
  });

  it('should fail with empty preferences array', async () => {
    const errors = await validate(toDto({ preferences: [] }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('preferences');
  });

  it('should fail when preferences exceeds 1000 items', async () => {
    const prefs = Array.from({ length: 1001 }, (_, i) => validPref(i));
    const errors = await validate(toDto({ preferences: prefs }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('preferences');
  });

  it('should fail when nested preference has invalid data', async () => {
    const errors = await validate(
      toDto({
        preferences: [{ channel: 'email', isOptedIn: true }],
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
