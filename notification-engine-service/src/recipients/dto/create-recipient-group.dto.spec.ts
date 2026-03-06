import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateRecipientGroupDto } from './create-recipient-group.dto.js';

function toDto(plain: Record<string, any>): CreateRecipientGroupDto {
  return plainToInstance(CreateRecipientGroupDto, plain);
}

describe('CreateRecipientGroupDto', () => {
  it('should pass with name only', async () => {
    const errors = await validate(toDto({ name: 'VIP Customers' }));
    expect(errors).toHaveLength(0);
  });

  it('should pass with name and members', async () => {
    const errors = await validate(
      toDto({
        name: 'VIP Customers',
        description: 'High-value customers',
        members: [
          { email: 'user@example.com', phone: '+1234567890' },
          { email: 'user2@example.com', memberName: 'Jane Doe' },
        ],
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('should fail when name is missing', async () => {
    const errors = await validate(toDto({}));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail when name exceeds 255 chars', async () => {
    const errors = await validate(toDto({ name: 'x'.repeat(256) }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail when nested member is missing email', async () => {
    const errors = await validate(
      toDto({
        name: 'Group',
        members: [{ phone: '+1234567890' }],
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when member email exceeds 255 chars', async () => {
    const errors = await validate(
      toDto({
        name: 'Group',
        members: [{ email: 'x'.repeat(256) }],
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when member phone exceeds 50 chars', async () => {
    const errors = await validate(
      toDto({
        name: 'Group',
        members: [{ email: 'a@b.com', phone: 'x'.repeat(51) }],
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should pass with optional description', async () => {
    const errors = await validate(
      toDto({ name: 'Group', description: 'A description' }),
    );
    expect(errors).toHaveLength(0);
  });
});
