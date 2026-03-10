import { HashingService } from './hashing.service.js';

describe('HashingService', () => {
  let service: HashingService;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string, def?: any) => {
        const values: Record<string, any> = {
          'braze.emailHashPepper': 'test-pepper-secret',
          'braze.pepperCacheTtl': 86400,
        };
        return values[key] ?? def;
      }),
    };

    service = new HashingService(mockConfigService);
  });

  describe('normalizeEmail', () => {
    it('should trim whitespace', () => {
      expect(service.normalizeEmail('  user@example.com  ')).toBe(
        'user@example.com',
      );
    });

    it('should lowercase', () => {
      expect(service.normalizeEmail('User@Example.COM')).toBe(
        'user@example.com',
      );
    });

    it('should apply NFKC normalization', () => {
      // NFKC decomposes and recomposes compatibility characters
      const nfkcInput = 'u\u0308ser@example.com'; // ü as u + combining diaeresis
      const result = service.normalizeEmail(nfkcInput);
      expect(result).toBe('üser@example.com');
    });

    it('should handle combined trim + lowercase + NFKC', () => {
      expect(service.normalizeEmail('  USER@EXAMPLE.COM  ')).toBe(
        'user@example.com',
      );
    });
  });

  describe('hashEmail', () => {
    it('should return a 64-character hex digest', () => {
      const hash = service.hashEmail('user@example.com');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce deterministic output for same input', () => {
      const hash1 = service.hashEmail('user@example.com');
      const hash2 = service.hashEmail('user@example.com');
      expect(hash1).toBe(hash2);
    });

    it('should produce same hash regardless of casing', () => {
      const hash1 = service.hashEmail('user@example.com');
      const hash2 = service.hashEmail('USER@EXAMPLE.COM');
      expect(hash1).toBe(hash2);
    });

    it('should produce same hash regardless of whitespace', () => {
      const hash1 = service.hashEmail('user@example.com');
      const hash2 = service.hashEmail('  user@example.com  ');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different emails', () => {
      const hash1 = service.hashEmail('user1@example.com');
      const hash2 = service.hashEmail('user2@example.com');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('different peppers produce different hashes', () => {
    it('should produce different hash with different pepper', () => {
      const hash1 = service.hashEmail('user@example.com');

      // Create a new service with a different pepper
      const otherConfigService = {
        get: jest.fn((key: string, def?: any) => {
          const values: Record<string, any> = {
            'braze.emailHashPepper': 'different-pepper',
            'braze.pepperCacheTtl': 86400,
          };
          return values[key] ?? def;
        }),
      };
      const service2 = new HashingService(otherConfigService as any);
      const hash2 = service2.hashEmail('user@example.com');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('pepper caching', () => {
    it('should use cached pepper on subsequent calls', () => {
      service.hashEmail('user@example.com');
      service.hashEmail('user@example.com');

      // ConfigService.get for pepper should only be called once (cached)
      const pepperCalls = mockConfigService.get.mock.calls.filter(
        (c: any[]) => c[0] === 'braze.emailHashPepper',
      );
      expect(pepperCalls.length).toBe(1);
    });
  });
});
