import { Test, TestingModule } from '@nestjs/testing';
import {
  MappingEngineService,
  FieldMapping,
} from './mapping-engine.service.js';

describe('MappingEngineService', () => {
  let service: MappingEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MappingEngineService],
    }).compile();

    service = module.get<MappingEngineService>(MappingEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should normalize a simple direct mapping', () => {
    const payload = { customer: { email: 'john@example.com' } };
    const mappings: Record<string, FieldMapping> = {
      email: { source: 'customer.email', target: 'email' },
    };

    const result = service.normalizePayload(payload, mappings);

    expect(result.normalizedFields).toEqual({ email: 'john@example.com' });
    expect(result.warnings).toHaveLength(0);
    expect(result.missingRequiredFields).toHaveLength(0);
  });

  it('should apply default value when source is missing', () => {
    const payload = {};
    const mappings: Record<string, FieldMapping> = {
      status: {
        source: 'missing.field',
        target: 'status',
        defaultValue: 'pending',
      },
    };

    const result = service.normalizePayload(payload, mappings);
    expect(result.normalizedFields.status).toBe('pending');
  });

  it('should handle concatenate transform with multiple sources', () => {
    const payload = { first: 'John', last: 'Doe' };
    const mappings: Record<string, FieldMapping> = {
      fullName: {
        source: ['first', 'last'],
        target: 'fullName',
        transform: 'concatenate',
        transformOptions: { separator: ' ' },
      },
    };

    const result = service.normalizePayload(payload, mappings);
    expect(result.normalizedFields.fullName).toBe('John Doe');
  });

  it('should handle static transform ignoring source', () => {
    const payload = { anything: 'value' };
    const mappings: Record<string, FieldMapping> = {
      version: {
        source: 'anything',
        target: 'schemaVersion',
        transform: 'static',
        transformOptions: { value: '2.0' },
      },
    };

    const result = service.normalizePayload(payload, mappings);
    expect(result.normalizedFields.schemaVersion).toBe('2.0');
  });

  it('should report missing required fields', () => {
    const payload = {};
    const mappings: Record<string, FieldMapping> = {
      email: {
        source: 'customer.email',
        target: 'email',
        required: true,
      },
    };

    const result = service.normalizePayload(payload, mappings);
    expect(result.missingRequiredFields).toContain('email');
  });

  it('should add warning for unknown transforms', () => {
    const payload = { a: 1 };
    const mappings: Record<string, FieldMapping> = {
      field: {
        source: 'a',
        target: 'field',
        transform: 'nonexistent',
      },
    };

    const result = service.normalizePayload(payload, mappings);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Unknown transform');
  });

  it('should add warning on transform error', () => {
    const payload = { value: 'not-a-number' };
    const mappings: Record<string, FieldMapping> = {
      num: {
        source: 'value',
        target: 'num',
        transform: 'toNumber',
      },
    };

    const result = service.normalizePayload(payload, mappings);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Transform error');
  });

  it('should handle multiple field mappings', () => {
    const payload = {
      orderId: 'ORD-123',
      customer: { email: 'a@b.com' },
      total: '99.99',
    };
    const mappings: Record<string, FieldMapping> = {
      orderId: { source: 'orderId', target: 'orderId' },
      email: { source: 'customer.email', target: 'customerEmail' },
      total: { source: 'total', target: 'orderTotal', transform: 'toNumber' },
    };

    const result = service.normalizePayload(payload, mappings);
    expect(result.normalizedFields).toEqual({
      orderId: 'ORD-123',
      customerEmail: 'a@b.com',
      orderTotal: 99.99,
    });
  });

  it('should report required field as missing when transform throws', () => {
    const payload = { value: 'bad' };
    const mappings: Record<string, FieldMapping> = {
      num: {
        source: 'value',
        target: 'num',
        transform: 'toNumber',
        required: true,
      },
    };

    const result = service.normalizePayload(payload, mappings);
    expect(result.missingRequiredFields).toContain('num');
  });

  it('should use field name as target when target is missing', () => {
    const payload = { email: 'a@b.com' };
    const mappings: Record<string, FieldMapping> = {
      email: { source: 'email', target: undefined as any },
    };

    const result = service.normalizePayload(payload, mappings);
    expect(result.normalizedFields.email).toBe('a@b.com');
  });
});
