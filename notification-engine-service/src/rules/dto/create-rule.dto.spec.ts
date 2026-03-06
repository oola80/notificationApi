import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateRuleDto } from './create-rule.dto.js';

function toDto(plain: Record<string, any>): CreateRuleDto {
  return plainToInstance(CreateRuleDto, plain);
}

function validPayload(): Record<string, any> {
  return {
    name: 'Order Confirmation',
    eventType: 'order.created',
    actions: [
      {
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipientType: 'customer',
      },
    ],
  };
}

describe('CreateRuleDto', () => {
  it('should pass with valid minimal payload', async () => {
    const errors = await validate(toDto(validPayload()));
    expect(errors).toHaveLength(0);
  });

  it('should pass with all optional fields', async () => {
    const errors = await validate(
      toDto({
        ...validPayload(),
        conditions: { field: 'amount', operator: 'gt', value: 100 },
        suppression: { dedupKey: ['orderId'], modes: [] },
        deliveryPriority: 'critical',
        priority: 10,
        isExclusive: true,
        createdBy: 'admin',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('should fail when name is missing', async () => {
    const { name: _, ...payload } = validPayload();
    const errors = await validate(toDto(payload));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail when eventType is missing', async () => {
    const { eventType: _, ...payload } = validPayload();
    const errors = await validate(toDto(payload));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('eventType');
  });

  it('should fail when actions is empty', async () => {
    const errors = await validate(toDto({ ...validPayload(), actions: [] }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('actions');
  });

  it('should fail when name exceeds 255 chars', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), name: 'x'.repeat(256) }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });

  it('should fail when eventType exceeds 100 chars', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), eventType: 'x'.repeat(101) }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('eventType');
  });

  it('should fail with invalid deliveryPriority', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), deliveryPriority: 'urgent' }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'deliveryPriority')).toBe(true);
  });

  it('should fail with negative priority', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), priority: -1 }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });

  it('should fail with non-integer priority', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), priority: 1.5 }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });

  it('should fail with non-object conditions', async () => {
    const errors = await validate(
      toDto({ ...validPayload(), conditions: 'not-an-object' }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'conditions')).toBe(true);
  });

  describe('nested RuleActionDto validation', () => {
    it('should fail when action templateId is missing', async () => {
      const errors = await validate(
        toDto({
          ...validPayload(),
          actions: [{ channels: ['email'], recipientType: 'customer' }],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when action has invalid channel', async () => {
      const errors = await validate(
        toDto({
          ...validPayload(),
          actions: [
            {
              templateId: 'tpl-1',
              channels: ['telegram'],
              recipientType: 'customer',
            },
          ],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when action has invalid recipientType', async () => {
      const errors = await validate(
        toDto({
          ...validPayload(),
          actions: [
            {
              templateId: 'tpl-1',
              channels: ['email'],
              recipientType: 'broadcast',
            },
          ],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when action has negative delayMinutes', async () => {
      const errors = await validate(
        toDto({
          ...validPayload(),
          actions: [
            {
              templateId: 'tpl-1',
              channels: ['email'],
              recipientType: 'customer',
              delayMinutes: -5,
            },
          ],
        }),
      );
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
