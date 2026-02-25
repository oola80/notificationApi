import { PriorityResolverService } from './priority-resolver.service.js';

describe('PriorityResolverService', () => {
  let resolver: PriorityResolverService;

  beforeEach(() => {
    resolver = new PriorityResolverService();
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('resolveEffectivePriority', () => {
    it('should return rule priority when rule overrides with critical', () => {
      expect(resolver.resolveEffectivePriority('normal', 'critical')).toBe(
        'critical',
      );
    });

    it('should return rule priority when rule overrides with normal', () => {
      expect(resolver.resolveEffectivePriority('critical', 'normal')).toBe(
        'normal',
      );
    });

    it('should inherit event priority when rule priority is null', () => {
      expect(resolver.resolveEffectivePriority('critical', null)).toBe(
        'critical',
      );
    });

    it('should inherit event priority when rule priority is undefined', () => {
      expect(resolver.resolveEffectivePriority('normal', undefined)).toBe(
        'normal',
      );
    });
  });
});
