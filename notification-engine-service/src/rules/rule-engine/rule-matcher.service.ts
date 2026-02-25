import { Injectable } from '@nestjs/common';
import { NotificationRulesRepository } from '../notification-rules.repository.js';
import { ConditionEvaluatorService } from './condition-evaluator.service.js';
import { NotificationRule } from '../entities/notification-rule.entity.js';

@Injectable()
export class RuleMatcherService {
  constructor(
    private readonly repository: NotificationRulesRepository,
    private readonly conditionEvaluator: ConditionEvaluatorService,
  ) {}

  async matchRules(event: {
    eventType: string;
    [key: string]: any;
  }): Promise<NotificationRule[]> {
    const rules = await this.repository.findByEventType(event.eventType);
    return this.matchFromRules(rules, event);
  }

  matchFromRules(
    rules: NotificationRule[],
    event: { eventType: string; [key: string]: any },
  ): NotificationRule[] {
    const matched: NotificationRule[] = [];

    for (const rule of rules) {
      const passes = this.conditionEvaluator.evaluateConditions(
        rule.conditions,
        event,
      );

      if (passes) {
        matched.push(rule);

        if (rule.isExclusive) {
          break;
        }
      }
    }

    return matched;
  }
}
