import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { WebhookEventDto } from './webhook-event.dto.js';

describe('WebhookEventDto', () => {
  const validData = {
    sourceId: 'test-source',
    cycleId: 'cycle-001',
    eventType: 'order.created',
    payload: { id: '123', total: 99.99 },
  };

  it('should pass validation with valid complete DTO', async () => {
    const dto = plainToInstance(WebhookEventDto, {
      ...validData,
      sourceEventId: 'evt-001',
      timestamp: '2026-01-01T00:00:00Z',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject missing sourceId', async () => {
    const dto = plainToInstance(WebhookEventDto, {
      ...validData,
      sourceId: undefined,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'sourceId')).toBe(true);
  });

  it('should reject missing cycleId', async () => {
    const dto = plainToInstance(WebhookEventDto, {
      ...validData,
      cycleId: undefined,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'cycleId')).toBe(true);
  });

  it('should reject missing payload', async () => {
    const dto = plainToInstance(WebhookEventDto, {
      ...validData,
      payload: undefined,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'payload')).toBe(true);
  });
});
