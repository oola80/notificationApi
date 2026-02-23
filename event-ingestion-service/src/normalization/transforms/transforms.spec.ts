import { TRANSFORM_REGISTRY, TransformContext } from './transform-registry.js';

describe('Transform Registry', () => {
  const ctx: TransformContext = {
    payload: {
      customer: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      },
      order: { id: 'ORD-123', total: 99.99 },
      items: [
        { sku: 'ABC', qty: 2 },
        { sku: 'DEF', qty: 1 },
      ],
      timestamp: 1705312200000,
    },
  };

  describe('direct', () => {
    it('should return value as-is', () => {
      expect(TRANSFORM_REGISTRY.direct('hello', {}, ctx)).toBe('hello');
    });

    it('should return objects as-is', () => {
      const obj = { a: 1 };
      expect(TRANSFORM_REGISTRY.direct(obj, {}, ctx)).toBe(obj);
    });
  });

  describe('concatenate', () => {
    it('should join values with separator', () => {
      expect(
        TRANSFORM_REGISTRY.concatenate(
          ['John', 'Doe'],
          { separator: ' ' },
          ctx,
        ),
      ).toBe('John Doe');
    });

    it('should join without separator by default', () => {
      expect(TRANSFORM_REGISTRY.concatenate(['a', 'b', 'c'], {}, ctx)).toBe(
        'abc',
      );
    });
  });

  describe('map', () => {
    it('should map value using mappings object', () => {
      const options = { mappings: { active: 'ACTIVE', inactive: 'INACTIVE' } };
      expect(TRANSFORM_REGISTRY.map('active', options, ctx)).toBe('ACTIVE');
    });

    it('should return original value when no mapping found', () => {
      const options = { mappings: { a: 'A' } };
      expect(TRANSFORM_REGISTRY.map('unknown', options, ctx)).toBe('unknown');
    });
  });

  describe('prefix', () => {
    it('should prepend prefix to value', () => {
      expect(TRANSFORM_REGISTRY.prefix('123', { prefix: 'ORD-' }, ctx)).toBe(
        'ORD-123',
      );
    });
  });

  describe('suffix', () => {
    it('should append suffix to value', () => {
      expect(TRANSFORM_REGISTRY.suffix('order', { suffix: '_v2' }, ctx)).toBe(
        'order_v2',
      );
    });
  });

  describe('template', () => {
    it('should replace template placeholders with payload values', () => {
      const options = {
        template: '{{customer.firstName}} {{customer.lastName}}',
      };
      expect(TRANSFORM_REGISTRY.template(null, options, ctx)).toBe('John Doe');
    });

    it('should replace missing values with empty string', () => {
      const options = { template: 'Hello {{customer.missing}}!' };
      expect(TRANSFORM_REGISTRY.template(null, options, ctx)).toBe('Hello !');
    });
  });

  describe('dateFormat', () => {
    it('should parse and format a date', () => {
      const result = TRANSFORM_REGISTRY.dateFormat(
        '2024-01-15T10:30:00Z',
        { outputFormat: 'YYYY-MM-DD' },
        ctx,
      );
      expect(result).toBe('2024-01-15');
    });

    it('should parse with custom input format', () => {
      const result = TRANSFORM_REGISTRY.dateFormat(
        '15/01/2024',
        { inputFormat: 'DD/MM/YYYY', outputFormat: 'YYYY-MM-DD' },
        ctx,
      );
      expect(result).toBe('2024-01-15');
    });

    it('should throw on invalid date', () => {
      expect(() =>
        TRANSFORM_REGISTRY.dateFormat(
          'bad',
          { inputFormat: 'YYYY-MM-DD', outputFormat: 'YYYY' },
          ctx,
        ),
      ).toThrow('dateFormat');
    });
  });

  describe('epochToIso', () => {
    it('should convert epoch ms to ISO-8601', () => {
      const result = TRANSFORM_REGISTRY.epochToIso(1705314600000, {}, ctx);
      expect(result).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should convert epoch seconds to ISO-8601', () => {
      const result = TRANSFORM_REGISTRY.epochToIso(
        1705314600,
        { unit: 's' },
        ctx,
      );
      expect(result).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('toNumber', () => {
    it('should convert string to number', () => {
      expect(TRANSFORM_REGISTRY.toNumber('42', {}, ctx)).toBe(42);
    });

    it('should throw on NaN', () => {
      expect(() => TRANSFORM_REGISTRY.toNumber('abc', {}, ctx)).toThrow(
        'toNumber',
      );
    });
  });

  describe('toString', () => {
    const toStringFn = TRANSFORM_REGISTRY['toString'];

    it('should convert number to string', () => {
      expect(toStringFn(42, {}, ctx)).toBe('42');
    });

    it('should convert boolean to string', () => {
      expect(toStringFn(true, {}, ctx)).toBe('true');
    });
  });

  describe('arrayMap', () => {
    it('should rename keys in array items', () => {
      const items = [{ sku: 'ABC', qty: 2 }];
      const options = { fieldRenames: { sku: 'productCode', qty: 'quantity' } };
      const result = TRANSFORM_REGISTRY.arrayMap(items, options, ctx);
      expect(result).toEqual([{ productCode: 'ABC', quantity: 2 }]);
    });

    it('should preserve fields not in rename map', () => {
      const items = [{ sku: 'ABC', extra: 'keep' }];
      const options = { fieldRenames: { sku: 'productCode' } };
      const result = TRANSFORM_REGISTRY.arrayMap(items, options, ctx);
      expect(result).toEqual([{ productCode: 'ABC', extra: 'keep' }]);
    });
  });

  describe('jsonPath', () => {
    it('should extract values using JSONPath expression', () => {
      const result = TRANSFORM_REGISTRY.jsonPath(
        null,
        { expression: '$.items[*].sku' },
        ctx,
      );
      expect(result).toEqual(['ABC', 'DEF']);
    });
  });

  describe('static', () => {
    it('should return the static value ignoring source', () => {
      expect(
        TRANSFORM_REGISTRY.static('ignored', { value: 'constant' }, ctx),
      ).toBe('constant');
    });

    it('should return null static value', () => {
      expect(
        TRANSFORM_REGISTRY.static(undefined, { value: null }, ctx),
      ).toBeNull();
    });
  });
});
