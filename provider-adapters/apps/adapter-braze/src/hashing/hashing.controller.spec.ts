import { HashingController } from './hashing.controller.js';
import { HashingService } from './hashing.service.js';

describe('HashingController', () => {
  let controller: HashingController;
  let mockHashingService: any;

  beforeEach(() => {
    mockHashingService = {
      hashEmail: jest.fn().mockReturnValue('a'.repeat(64)),
      normalizeEmail: jest.fn().mockReturnValue('user@example.com'),
    };

    controller = new HashingController(mockHashingService);
  });

  describe('POST /v1/customers/hash-email', () => {
    it('should return hash response with correct fields', () => {
      const result = controller.hashEmail({ email: 'User@Example.COM' });

      expect(result).toEqual({
        emailHash: 'a'.repeat(64),
        algo: 'SHA-256',
        algoVersion: 'v1',
        normalizedEmail: 'user@example.com',
      });
    });

    it('should call hashEmail with the provided email', () => {
      controller.hashEmail({ email: 'test@example.com' });

      expect(mockHashingService.hashEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
    });

    it('should call normalizeEmail with the provided email', () => {
      controller.hashEmail({ email: 'TEST@EXAMPLE.COM' });

      expect(mockHashingService.normalizeEmail).toHaveBeenCalledWith(
        'TEST@EXAMPLE.COM',
      );
    });

    it('should return algo as SHA-256', () => {
      const result = controller.hashEmail({ email: 'user@example.com' });
      expect(result.algo).toBe('SHA-256');
    });

    it('should return algoVersion as v1', () => {
      const result = controller.hashEmail({ email: 'user@example.com' });
      expect(result.algoVersion).toBe('v1');
    });
  });
});
