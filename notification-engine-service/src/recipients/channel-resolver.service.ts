import { Injectable } from '@nestjs/common';
import { PreferenceCacheService } from '../preferences/preference-cache.service.js';
import { OverrideCacheService } from '../overrides/override-cache.service.js';
import { ChannelResolutionResult } from './interfaces/channel-resolution-result.interface.js';

@Injectable()
export class ChannelResolverService {
  constructor(
    private readonly preferenceCache: PreferenceCacheService,
    private readonly overrideCache: OverrideCacheService,
  ) {}

  async resolveChannels(
    ruleChannels: string[],
    customerId: string | null,
    eventType: string,
  ): Promise<ChannelResolutionResult> {
    const overrideChannels = this.overrideCache.getOverrides(eventType);

    if (!customerId) {
      const effectiveChannels = [
        ...new Set([...ruleChannels, ...overrideChannels]),
      ];
      return { effectiveChannels, filtered: false };
    }

    const preferences = await this.preferenceCache.getPreferences(customerId);

    if (preferences.length === 0) {
      const effectiveChannels = [
        ...new Set([...ruleChannels, ...overrideChannels]),
      ];
      return { effectiveChannels, filtered: false };
    }

    const optedOutChannels = new Set(
      preferences.filter((p) => !p.isOptedIn).map((p) => p.channel),
    );

    const filteredRuleChannels = ruleChannels.filter(
      (ch) => !optedOutChannels.has(ch),
    );

    const effectiveChannels = [
      ...new Set([...filteredRuleChannels, ...overrideChannels]),
    ];

    if (effectiveChannels.length === 0) {
      return {
        effectiveChannels: [],
        filtered: true,
        reason: 'all-channels-opted-out',
      };
    }

    const wasFiltered = filteredRuleChannels.length < ruleChannels.length;
    return { effectiveChannels, filtered: wasFiltered };
  }
}
