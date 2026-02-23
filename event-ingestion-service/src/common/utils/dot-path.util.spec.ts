import { extractValue, extractValues } from './dot-path.util.js';

describe('dot-path.util', () => {
  describe('extractValue', () => {
    it('should extract a top-level property', () => {
      expect(extractValue({ name: 'Alice' }, 'name')).toBe('Alice');
    });

    it('should extract a nested property', () => {
      const payload = { customer: { email: 'a@b.com' } };
      expect(extractValue(payload, 'customer.email')).toBe('a@b.com');
    });

    it('should extract a deeply nested property', () => {
      const payload = { a: { b: { c: { d: 42 } } } };
      expect(extractValue(payload, 'a.b.c.d')).toBe(42);
    });

    it('should support array index in paths', () => {
      const payload = { items: [{ sku: 'ABC' }, { sku: 'DEF' }] };
      expect(extractValue(payload, 'items.0.sku')).toBe('ABC');
      expect(extractValue(payload, 'items.1.sku')).toBe('DEF');
    });

    it('should return undefined for missing segments', () => {
      expect(extractValue({ a: 1 }, 'b')).toBeUndefined();
      expect(extractValue({ a: { b: 1 } }, 'a.c')).toBeUndefined();
    });

    it('should return undefined for null payload', () => {
      expect(extractValue(null, 'a')).toBeUndefined();
    });

    it('should return undefined for empty path', () => {
      expect(extractValue({ a: 1 }, '')).toBeUndefined();
    });

    it('should return undefined for undefined payload', () => {
      expect(extractValue(undefined, 'a')).toBeUndefined();
    });
  });

  describe('extractValues', () => {
    it('should extract multiple values', () => {
      const payload = { a: 1, b: { c: 2 }, d: 3 };
      expect(extractValues(payload, ['a', 'b.c', 'd'])).toEqual([1, 2, 3]);
    });

    it('should return undefined for missing paths', () => {
      const payload = { a: 1 };
      expect(extractValues(payload, ['a', 'b'])).toEqual([1, undefined]);
    });
  });
});
