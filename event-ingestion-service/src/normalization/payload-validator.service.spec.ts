import { Test, TestingModule } from '@nestjs/testing';
import { PayloadValidatorService } from './payload-validator.service.js';

describe('PayloadValidatorService', () => {
  let service: PayloadValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayloadValidatorService],
    }).compile();

    service = module.get<PayloadValidatorService>(PayloadValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should validate a correct payload against schema', () => {
    const schema = {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        total: { type: 'number' },
      },
      required: ['orderId'],
    };
    const payload = { orderId: 'ORD-1', total: 50 };

    const result = service.validate(payload, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return errors for invalid payload', () => {
    const schema = {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
      },
      required: ['orderId'],
    };
    const payload = {};

    const result = service.validate(payload, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should report type mismatches', () => {
    const schema = {
      type: 'object',
      properties: {
        count: { type: 'number' },
      },
    };
    const payload = { count: 'not-a-number' };

    const result = service.validate(payload, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should return all errors when multiple validations fail', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
      },
      required: ['a', 'b'],
    };
    const payload = {};

    const result = service.validate(payload, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('should validate a payload with no required fields', () => {
    const schema = {
      type: 'object',
      properties: {
        optional: { type: 'string' },
      },
    };
    const payload = {};

    const result = service.validate(payload, schema);
    expect(result.valid).toBe(true);
  });
});
