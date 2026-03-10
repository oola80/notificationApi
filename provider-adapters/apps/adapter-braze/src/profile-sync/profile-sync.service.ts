import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LRUCache } from 'lru-cache';
import { RecipientDto, createErrorResponse } from '@app/common';
import { BrazeClientService } from '../braze-client/braze-client.service.js';
import { HashingService } from '../hashing/hashing.service.js';
import { BRAZE_ERROR_CODES } from '../errors/braze-errors.js';

@Injectable()
export class ProfileSyncService {
  private readonly logger = new Logger(ProfileSyncService.name);
  private readonly profileSyncEnabled: boolean;
  private readonly cache: LRUCache<string, boolean>;

  constructor(
    private readonly brazeClient: BrazeClientService,
    private readonly hashingService: HashingService,
    private readonly configService: ConfigService,
  ) {
    this.profileSyncEnabled = this.configService.get<boolean>(
      'braze.profileSyncEnabled',
      false,
    );

    const ttlSeconds = this.configService.get<number>(
      'braze.profileCacheTtlSeconds',
      300,
    );

    this.cache = new LRUCache<string, boolean>({
      max: 10000,
      ttl: ttlSeconds * 1000,
    });
  }

  async ensureProfile(
    recipient: RecipientDto,
    channel: string,
  ): Promise<string> {
    if (!this.profileSyncEnabled) {
      // Pre-provisioned mode: use customerId directly
      if (!recipient.customerId) {
        throw createErrorResponse(
          'BZ-007',
          BRAZE_ERROR_CODES,
          'Profile sync is disabled and no customerId was provided. Either enable profile sync or provide a pre-provisioned customerId.',
        );
      }
      return recipient.customerId;
    }

    // Just-in-time sync mode: hash email to get external_id
    const externalId = this.hashingService.hashEmail(recipient.address);

    // Check cache
    if (this.cache.has(externalId)) {
      this.logger.debug(`Profile cache hit for ${externalId.substring(0, 8)}…`);
      return externalId;
    }

    // Cache miss: sync profile to Braze
    try {
      const attributes: Record<string, string> = {
        external_id: externalId,
      };

      if (channel === 'email') {
        attributes.email = recipient.address;
      } else if (channel === 'sms' || channel === 'whatsapp') {
        attributes.phone = recipient.address;
      }

      await this.brazeClient.trackUser({
        attributes: [attributes as any],
      });

      this.cache.set(externalId, true);
      this.logger.debug(
        `Profile synced and cached for ${externalId.substring(0, 8)}…`,
      );

      return externalId;
    } catch (error) {
      this.logger.error(
        `Profile sync failed: ${(error as Error).message}`,
      );
      throw createErrorResponse(
        'BZ-006',
        BRAZE_ERROR_CODES,
        `Profile sync failed: ${(error as Error).message}`,
      );
    }
  }
}
