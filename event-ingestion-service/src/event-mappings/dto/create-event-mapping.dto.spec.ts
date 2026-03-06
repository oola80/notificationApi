import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEventMappingDto } from './create-event-mapping.dto.js';

describe('CreateEventMappingDto', () => {
  const validData = {
    sourceId: 'dummy-src',
    eventType: 'test.type',
    name: 'Test Mapping',
    fieldMappings: { orderId: { source: '$.id' } },
  };

  it('should pass validation with valid complete DTO', async () => {
    const dto = plainToInstance(CreateEventMappingDto, {
      ...validData,
      priority: 'critical',
      description: 'A test mapping',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject missing sourceId', async () => {
    const dto = plainToInstance(CreateEventMappingDto, {
      ...validData,
      sourceId: undefined,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'sourceId')).toBe(true);
  });

  it('should reject missing eventType', async () => {
    const dto = plainToInstance(CreateEventMappingDto, {
      ...validData,
      eventType: undefined,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'eventType')).toBe(true);
  });

  it('should reject missing name', async () => {
    const dto = plainToInstance(CreateEventMappingDto, {
      ...validData,
      name: undefined,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should reject missing fieldMappings', async () => {
    const dto = plainToInstance(CreateEventMappingDto, {
      ...validData,
      fieldMappings: undefined,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'fieldMappings')).toBe(true);
  });

  it('should reject sourceId exceeding maxLength(50)', async () => {
    const dto = plainToInstance(CreateEventMappingDto, {
      ...validData,
      sourceId: 'a'.repeat(51),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'sourceId')).toBe(true);
  });

  it('should reject invalid priority value', async () => {
    const dto = plainToInstance(CreateEventMappingDto, {
      ...validData,
      priority: 'urgent',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'priority')).toBe(true);
  });
});
