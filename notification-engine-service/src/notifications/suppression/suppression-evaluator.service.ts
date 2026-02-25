import { Injectable, Logger } from '@nestjs/common';
import { NotificationsRepository } from '../notifications.repository.js';

export interface SuppressionConfig {
  dedupKey?: string[];
  modes?: SuppressionMode[];
}

export interface SuppressionMode {
  type: 'dedup' | 'cooldown' | 'maxCount';
  windowMinutes?: number;
  intervalMinutes?: number;
  limit?: number;
}

export interface SuppressionResult {
  suppressed: boolean;
  reason?: string;
  mode?: string;
}

@Injectable()
export class SuppressionEvaluatorService {
  private readonly logger = new Logger(SuppressionEvaluatorService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  async evaluate(
    suppression: SuppressionConfig | null | undefined,
    dedupKeyHash: string | null,
    ruleId: string,
  ): Promise<SuppressionResult> {
    if (!suppression || !suppression.modes || suppression.modes.length === 0) {
      return { suppressed: false };
    }

    if (!dedupKeyHash) {
      return { suppressed: false };
    }

    for (const mode of suppression.modes) {
      const result = await this.evaluateMode(mode, dedupKeyHash, ruleId);
      if (result.suppressed) {
        this.logger.log(
          `Suppressed by ${mode.type}: ${result.reason} (ruleId=${ruleId})`,
        );
        return result;
      }
    }

    return { suppressed: false };
  }

  private async evaluateMode(
    mode: SuppressionMode,
    dedupKeyHash: string,
    ruleId: string,
  ): Promise<SuppressionResult> {
    switch (mode.type) {
      case 'dedup':
        return this.evaluateDedup(mode, dedupKeyHash, ruleId);
      case 'cooldown':
        return this.evaluateCooldown(mode, dedupKeyHash, ruleId);
      case 'maxCount':
        return this.evaluateMaxCount(mode, dedupKeyHash, ruleId);
      default:
        return { suppressed: false };
    }
  }

  private async evaluateDedup(
    mode: SuppressionMode,
    dedupKeyHash: string,
    ruleId: string,
  ): Promise<SuppressionResult> {
    const windowMinutes = mode.windowMinutes ?? 60;

    const existing = await this.notificationsRepository.findForSuppressionCheck(
      ruleId,
      dedupKeyHash,
      windowMinutes,
    );

    if (existing.length > 0) {
      return {
        suppressed: true,
        reason: `Duplicate notification found within ${windowMinutes} minute window`,
        mode: 'dedup',
      };
    }

    return { suppressed: false };
  }

  private async evaluateCooldown(
    mode: SuppressionMode,
    dedupKeyHash: string,
    ruleId: string,
  ): Promise<SuppressionResult> {
    const intervalMinutes = mode.intervalMinutes ?? 60;

    const mostRecent =
      await this.notificationsRepository.findMostRecentForSuppression(
        ruleId,
        dedupKeyHash,
      );

    if (mostRecent) {
      const cooldownEnd = new Date(
        mostRecent.createdAt.getTime() + intervalMinutes * 60 * 1000,
      );

      if (cooldownEnd > new Date()) {
        return {
          suppressed: true,
          reason: `Cooldown active: ${intervalMinutes} minute interval not elapsed since last notification`,
          mode: 'cooldown',
        };
      }
    }

    return { suppressed: false };
  }

  private async evaluateMaxCount(
    mode: SuppressionMode,
    dedupKeyHash: string,
    ruleId: string,
  ): Promise<SuppressionResult> {
    const windowMinutes = mode.windowMinutes ?? 60;
    const limit = mode.limit ?? 1;

    const count = await this.notificationsRepository.countForSuppressionCheck(
      ruleId,
      dedupKeyHash,
      windowMinutes,
    );

    if (count >= limit) {
      return {
        suppressed: true,
        reason: `Max count reached: ${count}/${limit} within ${windowMinutes} minute window`,
        mode: 'maxCount',
      };
    }

    return { suppressed: false };
  }
}
