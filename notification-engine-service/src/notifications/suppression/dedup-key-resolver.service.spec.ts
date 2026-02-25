import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { DedupKeyResolverService } from './dedup-key-resolver.service.js';

describe('DedupKeyResolverService', () => {
  let service: DedupKeyResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DedupKeyResolverService],
    }).compile();

    service = module.get<DedupKeyResolverService>(DedupKeyResolverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolve', () => {
    it('should resolve top-level event fields', () => {
      const result = service.resolve(
        ['orderId', 'status'],
        { orderId: 'ORD-123', status: 'confirmed' },
        { email: 'test@example.com' },
      );

      expect(result.resolvedValues).toEqual({
        orderId: 'ORD-123',
        status: 'confirmed',
      });
    });

    it('should resolve recipient.email field', () => {
      const result = service.resolve(
        ['recipient.email'],
        { orderId: 'ORD-123' },
        { email: 'test@example.com' },
      );

      expect(result.resolvedValues).toEqual({
        'recipient.email': 'test@example.com',
      });
    });

    it('should resolve recipient.phone field', () => {
      const result = service.resolve(
        ['recipient.phone'],
        {},
        { phone: '+1234567890' },
      );

      expect(result.resolvedValues).toEqual({
        'recipient.phone': '+1234567890',
      });
    });

    it('should resolve recipient.name field', () => {
      const result = service.resolve(
        ['recipient.name'],
        {},
        { name: 'John Doe' },
      );

      expect(result.resolvedValues).toEqual({
        'recipient.name': 'John Doe',
      });
    });

    it('should resolve eventType from payload', () => {
      const result = service.resolve(
        ['eventType'],
        { eventType: 'order.created' },
        {},
      );

      expect(result.resolvedValues).toEqual({
        eventType: 'order.created',
      });
    });

    it('should concatenate values with pipe delimiter and hash with SHA-256', () => {
      const result = service.resolve(
        ['orderId', 'recipient.email'],
        { orderId: 'ORD-123' },
        { email: 'test@example.com' },
      );

      const expected = createHash('sha256')
        .update('ORD-123|test@example.com')
        .digest('hex');

      expect(result.hash).toBe(expected);
      expect(result.hash).toHaveLength(64);
    });

    it('should produce a 64-character hex hash', () => {
      const result = service.resolve(['orderId'], { orderId: 'ORD-123' }, {});

      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle missing fields as empty strings', () => {
      const result = service.resolve(
        ['nonExistentField', 'recipient.email'],
        { orderId: 'ORD-123' },
        {},
      );

      expect(result.resolvedValues).toEqual({
        nonExistentField: '',
        'recipient.email': '',
      });
    });

    it('should handle missing recipient fields as empty strings', () => {
      const result = service.resolve(
        ['recipient.phone'],
        {},
        { email: 'test@example.com' },
      );

      expect(result.resolvedValues).toEqual({
        'recipient.phone': '',
      });
    });

    it('should produce different hashes for different field values', () => {
      const result1 = service.resolve(['orderId'], { orderId: 'ORD-123' }, {});
      const result2 = service.resolve(['orderId'], { orderId: 'ORD-456' }, {});

      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should produce same hash for same field values', () => {
      const result1 = service.resolve(
        ['orderId', 'recipient.email'],
        { orderId: 'ORD-123' },
        { email: 'test@example.com' },
      );
      const result2 = service.resolve(
        ['orderId', 'recipient.email'],
        { orderId: 'ORD-123' },
        { email: 'test@example.com' },
      );

      expect(result1.hash).toBe(result2.hash);
    });

    it('should resolve multiple fields in order', () => {
      const result = service.resolve(
        ['eventType', 'orderId', 'recipient.email'],
        { eventType: 'order.shipped', orderId: 'ORD-789' },
        { email: 'user@example.com' },
      );

      const expected = createHash('sha256')
        .update('order.shipped|ORD-789|user@example.com')
        .digest('hex');

      expect(result.hash).toBe(expected);
      expect(result.resolvedValues).toEqual({
        eventType: 'order.shipped',
        orderId: 'ORD-789',
        'recipient.email': 'user@example.com',
      });
    });

    it('should convert numeric values to strings', () => {
      const result = service.resolve(['quantity'], { quantity: 42 }, {});

      expect(result.resolvedValues).toEqual({ quantity: '42' });
    });
  });
});
