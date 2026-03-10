import { ProfileSyncService } from './profile-sync.service.js';
import { HttpException } from '@nestjs/common';

describe('ProfileSyncService', () => {
  let service: ProfileSyncService;
  let mockBrazeClient: any;
  let mockHashingService: any;
  let mockConfigService: any;

  function createService(overrides: Record<string, any> = {}) {
    mockBrazeClient = {
      trackUser: jest.fn().mockResolvedValue({ message: 'success' }),
    };
    mockHashingService = {
      hashEmail: jest.fn().mockReturnValue('a'.repeat(64)),
    };
    mockConfigService = {
      get: jest.fn((key: string, def?: any) => {
        const values: Record<string, any> = {
          'braze.profileSyncEnabled': false,
          'braze.profileCacheTtlSeconds': 300,
          ...overrides,
        };
        return values[key] ?? def;
      }),
    };

    return new ProfileSyncService(
      mockBrazeClient,
      mockHashingService,
      mockConfigService,
    );
  }

  describe('disabled mode (pre-provisioned)', () => {
    beforeEach(() => {
      service = createService({ 'braze.profileSyncEnabled': false });
    });

    it('should return customerId directly when provided', async () => {
      const result = await service.ensureProfile(
        { address: 'user@example.com', customerId: 'pre-provisioned-id' },
        'email',
      );

      expect(result).toBe('pre-provisioned-id');
      expect(mockBrazeClient.trackUser).not.toHaveBeenCalled();
      expect(mockHashingService.hashEmail).not.toHaveBeenCalled();
    });

    it('should throw BZ-007 when customerId is missing', async () => {
      await expect(
        service.ensureProfile({ address: 'user@example.com' }, 'email'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('enabled mode (just-in-time sync)', () => {
    beforeEach(() => {
      service = createService({ 'braze.profileSyncEnabled': true });
    });

    it('should hash email and call trackUser on cache miss', async () => {
      const result = await service.ensureProfile(
        { address: 'user@example.com' },
        'email',
      );

      expect(result).toBe('a'.repeat(64));
      expect(mockHashingService.hashEmail).toHaveBeenCalledWith(
        'user@example.com',
      );
      expect(mockBrazeClient.trackUser).toHaveBeenCalledWith({
        attributes: [
          expect.objectContaining({
            external_id: 'a'.repeat(64),
            email: 'user@example.com',
          }),
        ],
      });
    });

    it('should set phone attribute for SMS channel', async () => {
      await service.ensureProfile(
        { address: '+15551234567' },
        'sms',
      );

      expect(mockBrazeClient.trackUser).toHaveBeenCalledWith({
        attributes: [
          expect.objectContaining({
            external_id: 'a'.repeat(64),
            phone: '+15551234567',
          }),
        ],
      });
    });

    it('should set phone attribute for WhatsApp channel', async () => {
      await service.ensureProfile(
        { address: '+15551234567' },
        'whatsapp',
      );

      expect(mockBrazeClient.trackUser).toHaveBeenCalledWith({
        attributes: [
          expect.objectContaining({
            phone: '+15551234567',
          }),
        ],
      });
    });

    it('should use cache on second call (cache hit)', async () => {
      await service.ensureProfile(
        { address: 'user@example.com' },
        'email',
      );

      // Reset trackUser mock to verify it's not called again
      mockBrazeClient.trackUser.mockClear();

      const result = await service.ensureProfile(
        { address: 'user@example.com' },
        'email',
      );

      expect(result).toBe('a'.repeat(64));
      expect(mockBrazeClient.trackUser).not.toHaveBeenCalled();
    });

    it('should throw BZ-006 when trackUser fails', async () => {
      mockBrazeClient.trackUser.mockRejectedValue(
        new Error('Braze API unavailable'),
      );

      await expect(
        service.ensureProfile({ address: 'user@example.com' }, 'email'),
      ).rejects.toThrow(HttpException);
    });

    it('should not cache on sync failure', async () => {
      mockBrazeClient.trackUser.mockRejectedValueOnce(
        new Error('Braze API unavailable'),
      );

      try {
        await service.ensureProfile({ address: 'user@example.com' }, 'email');
      } catch {
        // expected
      }

      // Make it succeed on next call
      mockBrazeClient.trackUser.mockResolvedValue({ message: 'success' });

      await service.ensureProfile({ address: 'user@example.com' }, 'email');

      // Should have called trackUser twice: once failed, once succeeded
      expect(mockBrazeClient.trackUser).toHaveBeenCalledTimes(2);
    });
  });
});
