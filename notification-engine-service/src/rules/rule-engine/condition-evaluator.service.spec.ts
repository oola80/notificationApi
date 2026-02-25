import { ConditionEvaluatorService } from './condition-evaluator.service.js';

describe('ConditionEvaluatorService', () => {
  let evaluator: ConditionEvaluatorService;

  beforeEach(() => {
    evaluator = new ConditionEvaluatorService();
  });

  it('should be defined', () => {
    expect(evaluator).toBeDefined();
  });

  describe('null/empty conditions', () => {
    it('should return true for null conditions', () => {
      expect(evaluator.evaluateConditions(null, { foo: 'bar' })).toBe(true);
    });

    it('should return true for undefined conditions', () => {
      expect(evaluator.evaluateConditions(undefined, { foo: 'bar' })).toBe(
        true,
      );
    });

    it('should return true for empty object conditions', () => {
      expect(evaluator.evaluateConditions({}, { foo: 'bar' })).toBe(true);
    });
  });

  describe('direct value shorthand ($eq)', () => {
    it('should match equal string values', () => {
      expect(
        evaluator.evaluateConditions(
          { status: 'confirmed' },
          { status: 'confirmed' },
        ),
      ).toBe(true);
    });

    it('should not match unequal string values', () => {
      expect(
        evaluator.evaluateConditions(
          { status: 'confirmed' },
          { status: 'pending' },
        ),
      ).toBe(false);
    });

    it('should match equal numeric values', () => {
      expect(
        evaluator.evaluateConditions({ amount: 100 }, { amount: 100 }),
      ).toBe(true);
    });

    it('should not match when field is missing', () => {
      expect(
        evaluator.evaluateConditions(
          { status: 'confirmed' },
          { other: 'value' },
        ),
      ).toBe(false);
    });
  });

  describe('$eq operator', () => {
    it('should match equal values', () => {
      expect(
        evaluator.evaluateConditions(
          { status: { $eq: 'confirmed' } },
          { status: 'confirmed' },
        ),
      ).toBe(true);
    });

    it('should not match unequal values', () => {
      expect(
        evaluator.evaluateConditions(
          { status: { $eq: 'confirmed' } },
          { status: 'pending' },
        ),
      ).toBe(false);
    });
  });

  describe('$ne operator', () => {
    it('should match when values differ', () => {
      expect(
        evaluator.evaluateConditions(
          { status: { $ne: 'cancelled' } },
          { status: 'confirmed' },
        ),
      ).toBe(true);
    });

    it('should not match when values are equal', () => {
      expect(
        evaluator.evaluateConditions(
          { status: { $ne: 'confirmed' } },
          { status: 'confirmed' },
        ),
      ).toBe(false);
    });
  });

  describe('$in operator', () => {
    it('should match when value is in array', () => {
      expect(
        evaluator.evaluateConditions(
          { status: { $in: ['confirmed', 'shipped'] } },
          { status: 'confirmed' },
        ),
      ).toBe(true);
    });

    it('should not match when value is not in array', () => {
      expect(
        evaluator.evaluateConditions(
          { status: { $in: ['confirmed', 'shipped'] } },
          { status: 'cancelled' },
        ),
      ).toBe(false);
    });

    it('should return false when operand is not an array', () => {
      expect(
        evaluator.evaluateConditions(
          { status: { $in: 'confirmed' } },
          { status: 'confirmed' },
        ),
      ).toBe(false);
    });
  });

  describe('$nin operator', () => {
    it('should match when value is not in array', () => {
      expect(
        evaluator.evaluateConditions(
          { status: { $nin: ['cancelled', 'refunded'] } },
          { status: 'confirmed' },
        ),
      ).toBe(true);
    });

    it('should not match when value is in array', () => {
      expect(
        evaluator.evaluateConditions(
          { status: { $nin: ['cancelled', 'refunded'] } },
          { status: 'cancelled' },
        ),
      ).toBe(false);
    });

    it('should return false when operand is not an array', () => {
      expect(
        evaluator.evaluateConditions(
          { status: { $nin: 'confirmed' } },
          { status: 'other' },
        ),
      ).toBe(false);
    });
  });

  describe('$gt operator', () => {
    it('should match when value is greater', () => {
      expect(
        evaluator.evaluateConditions({ amount: { $gt: 50 } }, { amount: 100 }),
      ).toBe(true);
    });

    it('should not match when value is equal', () => {
      expect(
        evaluator.evaluateConditions({ amount: { $gt: 100 } }, { amount: 100 }),
      ).toBe(false);
    });

    it('should return false for non-numeric value', () => {
      expect(
        evaluator.evaluateConditions(
          { amount: { $gt: 50 } },
          { amount: 'high' },
        ),
      ).toBe(false);
    });

    it('should return false for non-numeric operand', () => {
      expect(
        evaluator.evaluateConditions(
          { amount: { $gt: 'fifty' } },
          { amount: 100 },
        ),
      ).toBe(false);
    });
  });

  describe('$gte operator', () => {
    it('should match when value is greater or equal', () => {
      expect(
        evaluator.evaluateConditions(
          { amount: { $gte: 100 } },
          { amount: 100 },
        ),
      ).toBe(true);
    });

    it('should not match when value is less', () => {
      expect(
        evaluator.evaluateConditions({ amount: { $gte: 100 } }, { amount: 50 }),
      ).toBe(false);
    });
  });

  describe('$lt operator', () => {
    it('should match when value is less', () => {
      expect(
        evaluator.evaluateConditions({ amount: { $lt: 100 } }, { amount: 50 }),
      ).toBe(true);
    });

    it('should not match when value is equal', () => {
      expect(
        evaluator.evaluateConditions({ amount: { $lt: 100 } }, { amount: 100 }),
      ).toBe(false);
    });
  });

  describe('$lte operator', () => {
    it('should match when value is less or equal', () => {
      expect(
        evaluator.evaluateConditions(
          { amount: { $lte: 100 } },
          { amount: 100 },
        ),
      ).toBe(true);
    });

    it('should not match when value is greater', () => {
      expect(
        evaluator.evaluateConditions(
          { amount: { $lte: 100 } },
          { amount: 150 },
        ),
      ).toBe(false);
    });
  });

  describe('$exists operator', () => {
    it('should match when field exists and $exists is true', () => {
      expect(
        evaluator.evaluateConditions(
          { email: { $exists: true } },
          { email: 'test@example.com' },
        ),
      ).toBe(true);
    });

    it('should not match when field is missing and $exists is true', () => {
      expect(
        evaluator.evaluateConditions(
          { email: { $exists: true } },
          { name: 'Test' },
        ),
      ).toBe(false);
    });

    it('should match when field is missing and $exists is false', () => {
      expect(
        evaluator.evaluateConditions(
          { email: { $exists: false } },
          { name: 'Test' },
        ),
      ).toBe(true);
    });

    it('should not match when field exists and $exists is false', () => {
      expect(
        evaluator.evaluateConditions(
          { email: { $exists: false } },
          { email: 'test@example.com' },
        ),
      ).toBe(false);
    });
  });

  describe('$regex operator', () => {
    it('should match when regex matches', () => {
      expect(
        evaluator.evaluateConditions(
          { email: { $regex: '^admin@' } },
          { email: 'admin@example.com' },
        ),
      ).toBe(true);
    });

    it('should not match when regex does not match', () => {
      expect(
        evaluator.evaluateConditions(
          { email: { $regex: '^admin@' } },
          { email: 'user@example.com' },
        ),
      ).toBe(false);
    });

    it('should return false for invalid regex', () => {
      expect(
        evaluator.evaluateConditions(
          { email: { $regex: '[invalid' } },
          { email: 'test@example.com' },
        ),
      ).toBe(false);
    });

    it('should return false for non-string value', () => {
      expect(
        evaluator.evaluateConditions(
          { count: { $regex: '\\d+' } },
          { count: 42 },
        ),
      ).toBe(false);
    });
  });

  describe('unknown operator', () => {
    it('should return false for unknown operators', () => {
      expect(
        evaluator.evaluateConditions(
          { status: { $unknown: 'value' } },
          { status: 'confirmed' },
        ),
      ).toBe(false);
    });
  });

  describe('multiple conditions (AND logic)', () => {
    it('should return true when all conditions pass', () => {
      expect(
        evaluator.evaluateConditions(
          { status: 'confirmed', amount: { $gt: 50 } },
          { status: 'confirmed', amount: 100 },
        ),
      ).toBe(true);
    });

    it('should return false when any condition fails', () => {
      expect(
        evaluator.evaluateConditions(
          { status: 'confirmed', amount: { $gt: 200 } },
          { status: 'confirmed', amount: 100 },
        ),
      ).toBe(false);
    });

    it('should handle mixed shorthand and operator conditions', () => {
      expect(
        evaluator.evaluateConditions(
          {
            status: 'confirmed',
            amount: { $gte: 50, $lte: 200 },
            region: { $in: ['US', 'EU'] },
          },
          { status: 'confirmed', amount: 100, region: 'US' },
        ),
      ).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle null payload value with $eq null', () => {
      expect(
        evaluator.evaluateConditions({ note: { $eq: null } }, { note: null }),
      ).toBe(true);
    });

    it('should handle undefined payload value with $eq', () => {
      expect(
        evaluator.evaluateConditions(
          { missing: { $eq: undefined } },
          { other: 'value' },
        ),
      ).toBe(true);
    });

    it('should handle boolean values', () => {
      expect(
        evaluator.evaluateConditions({ isVip: true }, { isVip: true }),
      ).toBe(true);
    });
  });
});
