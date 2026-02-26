import Handlebars from 'handlebars';
import { registerHandlebarsHelpers } from './handlebars-helpers.js';

describe('Handlebars Helpers', () => {
  beforeAll(() => {
    registerHandlebarsHelpers();
  });

  describe('formatCurrency', () => {
    it('should format USD currency', () => {
      const template = Handlebars.compile('{{formatCurrency amount "USD"}}');
      expect(template({ amount: 29.99 })).toBe('$29.99');
    });

    it('should format EUR currency', () => {
      const template = Handlebars.compile('{{formatCurrency amount "EUR"}}');
      const result = template({ amount: 1234.56 });
      expect(result).toContain('1,234.56');
    });

    it('should handle zero', () => {
      const template = Handlebars.compile('{{formatCurrency amount "USD"}}');
      expect(template({ amount: 0 })).toBe('$0.00');
    });

    it('should handle negative values', () => {
      const template = Handlebars.compile('{{formatCurrency amount "USD"}}');
      const result = template({ amount: -15.5 });
      expect(result).toContain('15.50');
    });
  });

  describe('formatDate', () => {
    it('should format with MMM DD, YYYY pattern', () => {
      const template = Handlebars.compile(
        '{{formatDate date "MMM DD, YYYY"}}',
      );
      const result = template({ date: '2026-01-15' });
      expect(result).toBe('Jan 15, 2026');
    });

    it('should format with YYYY-MM-DD pattern', () => {
      const template = Handlebars.compile(
        '{{formatDate date "YYYY-MM-DD"}}',
      );
      const result = template({ date: '2026-03-20T10:30:00Z' });
      expect(result).toBe('2026-03-20');
    });
  });

  describe('uppercase', () => {
    it('should convert text to uppercase', () => {
      const template = Handlebars.compile('{{uppercase text}}');
      expect(template({ text: 'hello world' })).toBe('HELLO WORLD');
    });

    it('should handle empty string input', () => {
      const template = Handlebars.compile('{{uppercase text}}');
      expect(template({ text: '' })).toBe('');
    });
  });

  describe('lowercase', () => {
    it('should convert text to lowercase', () => {
      const template = Handlebars.compile('{{lowercase text}}');
      expect(template({ text: 'HELLO WORLD' })).toBe('hello world');
    });

    it('should handle empty string input', () => {
      const template = Handlebars.compile('{{lowercase text}}');
      expect(template({ text: '' })).toBe('');
    });
  });

  describe('truncate', () => {
    it('should return text as-is if shorter than limit', () => {
      const template = Handlebars.compile('{{truncate text 20}}');
      expect(template({ text: 'short' })).toBe('short');
    });

    it('should return text as-is at exact limit', () => {
      const template = Handlebars.compile('{{truncate text 5}}');
      expect(template({ text: 'exact' })).toBe('exact');
    });

    it('should truncate and add ellipsis when exceeding limit', () => {
      const template = Handlebars.compile('{{truncate text 5}}');
      expect(template({ text: 'a very long text' })).toBe('a ver...');
    });

    it('should handle empty string input', () => {
      const template = Handlebars.compile('{{truncate text 10}}');
      expect(template({ text: '' })).toBe('');
    });
  });

  describe('eq (block helper)', () => {
    it('should render block when values are equal', () => {
      const template = Handlebars.compile(
        '{{#eq status "active"}}YES{{else}}NO{{/eq}}',
      );
      expect(template({ status: 'active' })).toBe('YES');
    });

    it('should render inverse when values are not equal', () => {
      const template = Handlebars.compile(
        '{{#eq status "active"}}YES{{else}}NO{{/eq}}',
      );
      expect(template({ status: 'inactive' })).toBe('NO');
    });
  });

  describe('gt (block helper)', () => {
    it('should render block when a > b', () => {
      const template = Handlebars.compile(
        '{{#gt count 5}}MANY{{else}}FEW{{/gt}}',
      );
      expect(template({ count: 10 })).toBe('MANY');
    });

    it('should render inverse when a equals b', () => {
      const template = Handlebars.compile(
        '{{#gt count 5}}MANY{{else}}FEW{{/gt}}',
      );
      expect(template({ count: 5 })).toBe('FEW');
    });

    it('should render inverse when a < b', () => {
      const template = Handlebars.compile(
        '{{#gt count 5}}MANY{{else}}FEW{{/gt}}',
      );
      expect(template({ count: 2 })).toBe('FEW');
    });
  });

  describe('default', () => {
    it('should return value when truthy', () => {
      const template = Handlebars.compile('{{default name "Unknown"}}');
      expect(template({ name: 'Alice' })).toBe('Alice');
    });

    it('should return fallback when value is falsy', () => {
      const template = Handlebars.compile('{{default name "Unknown"}}');
      expect(template({})).toBe('Unknown');
    });
  });
});
